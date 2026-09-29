import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { expandHome, noteFileName, notesGlob } from '../../util';

// These run the extension's real commands in a VS Code window. Prompts are answered by swapping the
// vscode.window functions the extension calls, and notes go to a temp folder set as notes.notesLocation.

type TreeNote = vscode.TreeItem & { name: string; isFolder: boolean };
interface NotesTree {
	getChildren(note?: TreeNote): Thenable<TreeNote[]>;
	onDidChangeTreeData: vscode.Event<unknown>;
}

const win = vscode.window as any;
const replaced: [string, unknown][] = [];

// swap a vscode.window function until the end of the test
function replace(name: string, fn: (...args: any[]) => unknown): void {
	replaced.push([name, win[name]]);
	win[name] = fn;
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function until(condition: () => boolean, what: string, ms = 3000): Promise<void> {
	const end = Date.now() + ms;
	while (!condition()) {
		if (Date.now() > end) {
			throw new Error(`timed out waiting for ${what}`);
		}
		await sleep(25);
	}
}

// set a notes.* setting and wait until the extension has seen it (undefined resets it)
async function setting(name: string, value: string | undefined): Promise<void> {
	const notes = () => vscode.workspace.getConfiguration('notes');
	await notes().update(name, value, vscode.ConfigurationTarget.Global);
	await until(() => notes().inspect(name)?.globalValue === value, `notes.${name} to change`);
}

suite('Notes', () => {
	let tree: NotesTree;
	let root: string;
	let asked: { input: vscode.InputBoxOptions[]; validation: string[]; warnings: string[]; errors: string[] };

	// answer the next name boxes with these values the way VS Code would:
	// a value that fails validation can't be accepted, so that box ends up cancelled
	function answer(...values: string[]): void {
		replace('showInputBox', async (options: vscode.InputBoxOptions = {}) => {
			asked.input.push(options);
			const value = values.shift();
			if (value === undefined) {
				return undefined;
			}
			const problem = await options.validateInput?.(value);
			if (problem) {
				asked.validation.push(typeof problem === 'string' ? problem : problem.message);
				return undefined;
			}
			return value;
		});
	}

	async function names(folder?: TreeNote): Promise<string[]> {
		return (await tree.getChildren(folder)).map(note => note.name);
	}

	async function item(name: string, folder?: TreeNote): Promise<TreeNote> {
		const found = (await tree.getChildren(folder)).find(note => note.name === name);
		assert.ok(found, `'${name}' is not in the tree`);
		return found;
	}

	function created(file: string): Promise<void> {
		return until(() => fs.existsSync(file), `${path.relative(root, file)} to be created`);
	}

	suiteSetup(async () => {
		const extension = vscode.extensions.getExtension('arthursav.vscode-notes');
		assert.ok(extension, 'the extension is not loaded');
		tree = (await extension.activate()).notesTree;
		root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'notes-test-')));
		await vscode.workspace.getConfiguration('files').update('enableTrash', false, vscode.ConfigurationTarget.Global);
	});

	setup(async () => {
		for (const entry of fs.readdirSync(root)) {
			fs.rmSync(path.join(root, entry), { recursive: true, force: true });
		}
		asked = { input: [], validation: [], warnings: [], errors: [] };
		replace('showWarningMessage', async (message: string) => { asked.warnings.push(message); return undefined; });
		replace('showErrorMessage', async (message: string) => { asked.errors.push(message); return undefined; });
		await setting('notesLocation', root);
		await setting('notesExtensions', undefined);
	});

	teardown(async () => {
		while (replaced.length) {
			const [name, fn] = replaced.pop()!;
			win[name] = fn;
		}
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	suiteTeardown(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	test('creates a note, opens it below the title, and the name box survives focus moving away', async () => {
		answer('Groceries');
		await vscode.commands.executeCommand('Notes.newNote');

		const file = path.join(root, 'Groceries.md');
		await created(file);
		assert.strictEqual(fs.readFileSync(file, 'utf8'), '# Groceries\n\n');
		assert.strictEqual(asked.input[0].ignoreFocusOut, true, 'the name box closes (and the note is dropped) when focus moves');
		await until(() => vscode.window.activeTextEditor?.document.uri.fsPath === file, 'the note to open');
		assert.strictEqual(vscode.window.activeTextEditor?.selection.active.line, 2);
		assert.deepStrictEqual(asked.errors, []);
	});

	test('the tree refreshes once the new note exists, not before', async () => {
		const file = path.join(root, 'Fresh.md');
		const existedAtRefresh: boolean[] = [];
		const listening = tree.onDidChangeTreeData(() => existedAtRefresh.push(fs.existsSync(file)));
		answer('Fresh');
		await vscode.commands.executeCommand('Notes.newNote');
		await created(file);
		listening.dispose();

		assert.strictEqual(existedAtRefresh[0], true, 'the tree refreshed before the note was written, so it stays missing');
		assert.ok((await names()).includes('Fresh.md'));
	});

	test('a slash in the name stays in the title and becomes a dash in the file name', async () => {
		answer('Standup 9/29');
		await vscode.commands.executeCommand('Notes.newNote');

		const file = path.join(root, 'Standup 9-29.md');
		await created(file);
		assert.strictEqual(fs.readFileSync(file, 'utf8'), '# Standup 9/29\n\n');
		assert.deepStrictEqual(asked.errors, []);
	});

	test('a typed .md extension is not doubled', async () => {
		answer('todo.md');
		await vscode.commands.executeCommand('Notes.newNote');

		await created(path.join(root, 'todo.md'));
		assert.strictEqual(fs.readFileSync(path.join(root, 'todo.md'), 'utf8'), '# todo\n\n');
		assert.ok(!fs.existsSync(path.join(root, 'todo.md.md')));
	});

	test('new note on a folder in the tree goes in that folder', async () => {
		fs.mkdirSync(path.join(root, 'Work'));
		answer('Plan');
		await vscode.commands.executeCommand('Notes.newNote', await item('Work'));

		await created(path.join(root, 'Work', 'Plan.md'));
		assert.match(asked.input[0].prompt ?? '', /in Work/);
	});

	test('new note with a note selected in the tree goes next to that note', async () => {
		fs.mkdirSync(path.join(root, 'Work'));
		fs.writeFileSync(path.join(root, 'Work', 'Plan.md'), '# Plan\n');
		answer('Retro');
		await vscode.commands.executeCommand('Notes.newNote', await item('Plan.md', await item('Work')));

		await created(path.join(root, 'Work', 'Retro.md'));
		assert.deepStrictEqual(asked.errors, []);
	});

	test('an existing name is refused in the name box and nothing is overwritten', async () => {
		fs.writeFileSync(path.join(root, 'Ideas.md'), 'keep me');
		answer('Ideas');
		await vscode.commands.executeCommand('Notes.newNote');

		assert.deepStrictEqual(asked.validation, ['\'Ideas.md\' already exists.']);
		assert.strictEqual(fs.readFileSync(path.join(root, 'Ideas.md'), 'utf8'), 'keep me');
	});

	test('without a notes location it asks for one instead of writing somewhere else', async () => {
		await setting('notesLocation', undefined);
		answer('Lost');
		await vscode.commands.executeCommand('Notes.newNote');

		assert.strictEqual(asked.input.length, 0);
		assert.deepStrictEqual(asked.warnings, ['Choose a folder to store your notes in first.']);
	});

	test('a notes location that does not exist yet is created', async () => {
		const later = path.join(root, 'not', 'yet');
		await setting('notesLocation', later);
		answer('First');
		await vscode.commands.executeCommand('Notes.newNote');

		await created(path.join(later, 'First.md'));
	});

	test('list notes offers nested notes and opens nothing when dismissed', async () => {
		fs.mkdirSync(path.join(root, 'Work'));
		fs.writeFileSync(path.join(root, 'a.md'), '');
		fs.writeFileSync(path.join(root, 'Work', 'b.md'), '');
		let offered: vscode.QuickPickItem[] = [];
		replace('showQuickPick', async (items: vscode.QuickPickItem[]) => { offered = await items; return undefined; });
		await vscode.commands.executeCommand('Notes.listNotes');

		assert.deepStrictEqual(offered.map(i => [i.label, i.description]), [['a.md', undefined], ['b.md', 'Work']]);
		await sleep(200);
		assert.strictEqual(vscode.window.activeTextEditor, undefined);
		assert.deepStrictEqual(asked.errors, []);
	});

	test('a single allowed extension still shows notes', async () => {
		await setting('notesExtensions', 'md');
		fs.writeFileSync(path.join(root, 'a.md'), '');
		fs.writeFileSync(path.join(root, 'b.txt'), '');

		assert.deepStrictEqual(await names(), ['a.md']);
	});

	test('hidden folders like .git are not shown', async () => {
		fs.mkdirSync(path.join(root, '.git'));
		fs.mkdirSync(path.join(root, 'Work'));

		assert.deepStrictEqual(await names(), ['Work']);
	});

	test('the tree follows a new notes location without a window reload', async () => {
		const other = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'notes-other-')));
		fs.writeFileSync(path.join(other, 'elsewhere.md'), '');
		try {
			await setting('notesLocation', other);
			assert.deepStrictEqual(await names(), ['elsewhere.md']);
		} finally {
			fs.rmSync(other, { recursive: true, force: true });
		}
	});

	test('notes added outside VS Code show up in the tree', async () => {
		// the previous test moved the watcher; give the new one a moment to start
		await sleep(1000);
		let refreshed = false;
		const listening = tree.onDidChangeTreeData(() => { refreshed = true; });
		fs.writeFileSync(path.join(root, 'synced.md'), '');
		try {
			await until(() => refreshed, 'the file watcher to refresh the tree', 5000);
		} finally {
			listening.dispose();
		}
		assert.ok((await names()).includes('synced.md'));
	});

	test('renames a note and keeps its extension', async () => {
		fs.writeFileSync(path.join(root, 'old.md'), '# old\n');
		answer('new');
		await vscode.commands.executeCommand('Notes.renameNote', await item('old.md'));

		await created(path.join(root, 'new.md'));
		assert.ok(!fs.existsSync(path.join(root, 'old.md')));
		assert.deepStrictEqual(asked.errors, []);
	});

	test('deletes a folder and its notes after confirming', async () => {
		fs.mkdirSync(path.join(root, 'Old'));
		fs.writeFileSync(path.join(root, 'Old', 'x.md'), '');
		replace('showWarningMessage', async (message: string) => { asked.warnings.push(message); return 'Delete'; });
		await vscode.commands.executeCommand('Notes.deleteFolder', await item('Old'));

		await until(() => !fs.existsSync(path.join(root, 'Old')), 'the folder to be deleted');
		assert.match(asked.warnings[0], /^Permanently delete the folder 'Old'/);
		assert.deepStrictEqual(asked.errors, []);
	});
});

suite('Note names', () => {
	test('file names for typed note names', () => {
		assert.strictEqual(noteFileName('Groceries', 'md', '*'), 'Groceries.md');
		assert.strictEqual(noteFileName('todo.md', 'md', '*'), 'todo.md');
		assert.strictEqual(noteFileName('v1.2', 'md', '*'), 'v1.2.md');
		assert.strictEqual(noteFileName('notes.txt', 'md', 'md, txt'), 'notes.txt');
		assert.strictEqual(noteFileName('a/b: c?', 'md', '*'), 'a-b c.md');
		assert.strictEqual(noteFileName('.plan', 'md', '*'), 'plan.md');
		assert.strictEqual(noteFileName('x', '.txt', '*'), 'x.txt');
		assert.strictEqual(noteFileName(' .. ', 'md', '*'), '');
	});

	test('glob patterns for the notes extensions setting', () => {
		assert.strictEqual(notesGlob('*'), '*');
		assert.strictEqual(notesGlob('md'), '*.md');
		assert.strictEqual(notesGlob('md, .txt', true), '**/*.{md,txt}');
	});

	test('~ and ${userHome} in the notes location', () => {
		assert.strictEqual(expandHome('~/Notes'), `${os.homedir()}/Notes`);
		assert.strictEqual(expandHome('${userHome}/Notes'), `${os.homedir()}/Notes`);
		assert.strictEqual(expandHome('~other/Notes'), '~other/Notes');
		assert.strictEqual(expandHome('/tmp/~/Notes'), '/tmp/~/Notes');
	});
});
