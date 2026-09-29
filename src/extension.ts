import * as vscode from 'vscode';
import * as fs from 'fs';
import * as gl from 'glob';
import * as path from 'path';
import { Note } from './note';
import { NotesViewProvider } from './notesViewProvider';
import { errorMessage, expandHome, noteFileName, notesGlob, safeName } from './util';

// activate extension
export function activate(context: vscode.ExtensionContext) {

	console.log('"vscode-notes" is active.');

	Notes.extensionId = context.extension.id;

	// get Notes configuration
	let notesTree = new NotesViewProvider(Notes.getNotesLocation(), Notes.getNotesExtensions());
	context.subscriptions.push(notesTree, vscode.window.registerTreeDataProvider('notes', notesTree.init()));

	// Listen for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			// point the tree at the new storage location or extensions right away
			if (e.affectsConfiguration('notes.notesLocation') || e.affectsConfiguration('notes.notesExtensions')) {
				notesTree.configure(Notes.getNotesLocation(), Notes.getNotesExtensions());
			}
		})
	);

	/*
	* register commands
	* handlers return their promise, so executeCommand resolves once the command is done
	*/

	// delete note
	let deleteNoteDisposable = vscode.commands.registerCommand('Notes.deleteNote', (note: Note) => {
		return Notes.deleteNote(note, notesTree);
	});
	context.subscriptions.push(deleteNoteDisposable);

	// delete folder
	let deleteFolderDisposable = vscode.commands.registerCommand('Notes.deleteFolder', (folder: Note) => {
		return Notes.deleteFolder(folder, notesTree);
	});
	context.subscriptions.push(deleteFolderDisposable);

	// list notes
	let listNotesDisposable = vscode.commands.registerCommand('Notes.listNotes', () => {
		return Notes.listNotes();
	});
	context.subscriptions.push(listNotesDisposable);

	// new note
	let newNoteDisposable = vscode.commands.registerCommand('Notes.newNote', (item?: unknown) => {
		return Notes.newNote(notesTree, item);
	});
	context.subscriptions.push(newNoteDisposable);

	// new folder
	let newFolderDisposable = vscode.commands.registerCommand('Notes.newFolder', (item?: unknown) => {
		return Notes.newFolder(notesTree, item);
	});
	context.subscriptions.push(newFolderDisposable);

	// open note
	let openNoteDisposable = vscode.commands.registerCommand('Notes.openNote', (note: Note | string) => {
		return Notes.openNote(note);
	});
	context.subscriptions.push(openNoteDisposable);

	// refresh notes
	let refreshNotesDisposable = vscode.commands.registerCommand('Notes.refreshNotes', () => {
		Notes.refreshNotes(notesTree);
	});
	context.subscriptions.push(refreshNotesDisposable);

	// rename note
	let renameNoteDisposable = vscode.commands.registerCommand('Notes.renameNote', (note: Note) => {
		return Notes.renameNote(note, notesTree);
	});
	context.subscriptions.push(renameNoteDisposable);

	// rename folder
	let renameFolderDisposable = vscode.commands.registerCommand('Notes.renameFolder', (folder: Note) => {
		return Notes.renameFolder(folder, notesTree);
	});
	context.subscriptions.push(renameFolderDisposable);

	// setup notes
	let setupNotesDisposable = vscode.commands.registerCommand('Notes.setupNotes', () => {
		return Notes.setupNotes();
	});
	context.subscriptions.push(setupNotesDisposable);

	// exposed for the integration tests
	return { notesTree };
};

// this method is called when extension is deactivated
export function deactivate() {
	/*
	* everything registered in context.subscriptions,
	* so nothing to do here for now
	*/
}

export class Notes {

	// id of this extension, for the settings link (set on activation)
	static extensionId = 'arthursav.vscode-notes';

	// get notes storage location, '' when not set
	static getNotesLocation(): string {
		const notesLocation = String(vscode.workspace.getConfiguration('notes').get('notesLocation') || '').trim();
		return notesLocation ? path.normalize(expandHome(notesLocation)) : '';
	}
	// get notes default extension
	static getNotesDefaultNoteExtension(): string {
		return String(vscode.workspace.getConfiguration('notes').get('notesDefaultNoteExtension') || 'md');
	}
	// get the extensions shown as notes
	static getNotesExtensions(): string {
		return String(vscode.workspace.getConfiguration('notes').get('notesExtensions') || '*');
	}

	// the notes location, ready to write to; undefined after telling the user why it isn't
	static async ensureNotesLocation(): Promise<string | undefined> {
		const notesLocation = Notes.getNotesLocation();

		// without a location a new note would land in VS Code's own working directory
		if (!notesLocation) {
			const action = await vscode.window.showWarningMessage('Choose a folder to store your notes in first.', 'Choose Folder');
			return action === 'Choose Folder' ? Notes.chooseNotesLocation() : undefined;
		}

		try {
			// a synced setting can point at a folder this machine doesn't have yet
			await fs.promises.mkdir(notesLocation, { recursive: true });
			return notesLocation;
		} catch (err) {
			const action = await vscode.window.showErrorMessage(`The notes folder '${notesLocation}' is not available: ${errorMessage(err)}`, 'Choose Folder');
			return action === 'Choose Folder' ? Notes.chooseNotesLocation() : undefined;
		}
	}

	// folder a new note or folder goes in: the clicked folder, the clicked note's folder, or the notes location
	static targetFolder(notesLocation: string, item?: unknown): string {
		if (item instanceof Note) {
			return item.isFolder ? item.fullPath : item.location;
		}
		return notesLocation;
	}

	// input box message for a typed name, undefined when the name is fine
	static validateName(value: string, fileName: string, folder: string, currentName?: string): string | undefined {
		if (!value.trim()) {
			return undefined;
		}
		if (!fileName) {
			return 'Use at least one letter or number.';
		}
		// renaming to a different case of the same name is fine on case-insensitive file systems
		const unchanged = currentName !== undefined && fileName.toLowerCase() === currentName.toLowerCase();
		if (!unchanged && fs.existsSync(path.join(folder, fileName))) {
			return `'${fileName}' already exists.`;
		}
		return undefined;
	}

	// delete note
	static async deleteNote(note: Note, tree: NotesViewProvider): Promise<void> {
		await Notes.deleteEntry(note, tree);
	}

	// delete folder
	static async deleteFolder(folder: Note, tree: NotesViewProvider): Promise<void> {
		if (!folder.isFolder) {
			vscode.window.showErrorMessage('Selected item is not a folder.');
			return;
		}
		await Notes.deleteEntry(folder, tree);
	}

	// delete a note or folder, to the trash unless files.enableTrash is off
	static async deleteEntry(item: Note, tree: NotesViewProvider): Promise<void> {
		const useTrash = vscode.workspace.getConfiguration('files').get<boolean>('enableTrash', true);
		const what = item.isFolder ? `the folder '${item.name}' and all its contents` : `'${item.name}'`;

		// prompt user for confirmation
		const result = await vscode.window.showWarningMessage(
			useTrash ? `Move ${what} to the trash?` : `Permanently delete ${what}? This can not be undone.`,
			{ modal: true },
			'Delete'
		);
		if (result !== 'Delete') {
			return;
		}

		try {
			await vscode.workspace.fs.delete(vscode.Uri.file(item.fullPath), { recursive: item.isFolder, useTrash });
		} catch (err) {
			vscode.window.showErrorMessage(`Failed to delete '${item.name}': ${errorMessage(err)}`);
			return;
		}

		// refresh tree after deleting
		tree.refresh();
	}

	// list notes
	static async listNotes(): Promise<void> {
		const notesLocation = await Notes.ensureNotesLocation();
		if (!notesLocation) {
			return;
		}

		// find notes in the storage location and its folders
		let files: string[];
		try {
			files = gl.sync(notesGlob(Notes.getNotesExtensions(), true), { cwd: notesLocation, nodir: true, nocase: true, ignore: '**/node_modules/**' });
		} catch (err) {
			vscode.window.showErrorMessage(`Failed to read the notes folder: ${errorMessage(err)}`);
			return;
		}

		if (files.length === 0) {
			const action = await vscode.window.showInformationMessage('There are no notes yet.', 'New Note');
			if (action === 'New Note') {
				await vscode.commands.executeCommand('Notes.newNote');
			}
			return;
		}

		// show list of notes, with the folder each one is in
		files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
		const picked = await vscode.window.showQuickPick(
			files.map(file => ({
				label: path.basename(file),
				description: path.dirname(file) === '.' ? undefined : path.dirname(file),
				file
			})),
			{ placeHolder: 'Open a note', matchOnDescription: true }
		);

		// open selected note, unless the list was dismissed
		if (picked) {
			await Notes.openNote(path.join(notesLocation, picked.file));
		}
	}

	// new note
	static async newNote(tree: NotesViewProvider, item?: unknown): Promise<void> {
		const notesLocation = await Notes.ensureNotesLocation();
		if (!notesLocation) {
			return;
		}

		// Determine the location where the note should be created
		const folder = Notes.targetFolder(notesLocation, item);
		const defaultExtension = Notes.getNotesDefaultNoteExtension();
		const extensions = Notes.getNotesExtensions();
		const toFileName = (value: string) => noteFileName(value, defaultExtension, extensions);

		// prompt user for a new note name; ignoreFocusOut keeps the box (and what was typed) when focus moves elsewhere
		const noteName = await vscode.window.showInputBox({
			prompt: folder === notesLocation ? 'Note name?' : `Note name? (in ${path.relative(notesLocation, folder)})`,
			ignoreFocusOut: true,
			validateInput: value => Notes.validateName(value, toFileName(value), folder)
		});

		const fileName = toFileName(noteName ?? '');
		if (!fileName) {
			return; // User cancelled
		}

		// set note path, and a first line with the name as typed (minus an extension typed with it)
		const filePath = path.join(folder, fileName);
		let title = String(noteName).trim();
		if (fileName === safeName(title)) {
			title = title.slice(0, title.length - path.extname(title).length);
		}

		try {
			await fs.promises.mkdir(folder, { recursive: true });
			// 'wx' fails rather than overwrite a note that appeared since the name was checked
			await fs.promises.writeFile(filePath, `# ${title}\n\n`, { flag: 'wx' });
		} catch (err) {
			vscode.window.showErrorMessage(`Failed to create the note '${fileName}': ${errorMessage(err)}`);
			return;
		}

		// refresh tree once the note exists, then open it with the cursor below the title
		tree.refresh();
		await Notes.openNote(filePath, true);
	}

	// new folder
	static async newFolder(tree: NotesViewProvider, item?: unknown): Promise<void> {
		const notesLocation = await Notes.ensureNotesLocation();
		if (!notesLocation) {
			return;
		}

		// Determine the location where the folder should be created
		const parentLocation = Notes.targetFolder(notesLocation, item);

		// prompt user for a new folder name
		const folderName = await vscode.window.showInputBox({
			prompt: 'Folder name?',
			ignoreFocusOut: true,
			validateInput: value => Notes.validateName(value, safeName(value), parentLocation)
		});

		const name = safeName(folderName ?? '');
		if (!name) {
			return; // User cancelled
		}

		try {
			await fs.promises.mkdir(path.join(parentLocation, name), { recursive: true });
		} catch (err) {
			vscode.window.showErrorMessage(`Failed to create the folder '${name}': ${errorMessage(err)}`);
			return;
		}

		// refresh tree after creating new folder
		tree.refresh();
	}

	// open note
	static async openNote(note: Note | string, cursorAtEnd = false): Promise<void> {
		// If it's a Note object and a folder, don't try to open it
		if (typeof note !== 'string' && note.isFolder) {
			return;
		}

		// a full path, or the note's location and name
		const filePath = typeof note === 'string' ? note : note.fullPath;

		try {
			const editor = await vscode.window.showTextDocument(vscode.Uri.file(filePath));
			if (cursorAtEnd) {
				const end = editor.document.lineAt(editor.document.lineCount - 1).range.end;
				editor.selection = new vscode.Selection(end, end);
			}
		} catch (err) {
			vscode.window.showErrorMessage(`Failed to open '${path.basename(filePath)}': ${errorMessage(err)}`);
		}
	}

	// refresh notes
	static refreshNotes(tree: NotesViewProvider): void {
		// refresh tree
		tree.refresh();
	}

	// rename note
	static async renameNote(note: Note, tree: NotesViewProvider): Promise<void> {
		// If it's a folder, don't try to rename it as a note
		if (note.isFolder) {
			return;
		}

		// a new name without an extension keeps the note's current one
		const noteExtension = path.extname(note.name).slice(1) || Notes.getNotesDefaultNoteExtension();
		const extensions = Notes.getNotesExtensions();
		const toFileName = (value: string) => noteFileName(value, noteExtension, extensions);

		// prompt user for new note name, with the name selected but not the extension
		const newNoteName = await vscode.window.showInputBox({
			prompt: 'New note name?',
			value: note.name,
			valueSelection: [0, note.name.length - path.extname(note.name).length],
			ignoreFocusOut: true,
			validateInput: value => Notes.validateName(value, toFileName(value), note.location, note.name)
		});

		await Notes.renameEntry(note, toFileName(newNoteName ?? ''), tree);
	}

	// rename folder
	static async renameFolder(folder: Note, tree: NotesViewProvider): Promise<void> {
		// If it's not a folder, don't try to rename it as a folder
		if (!folder.isFolder) {
			return;
		}

		// prompt user for new folder name
		const newFolderName = await vscode.window.showInputBox({
			prompt: 'New folder name?',
			value: folder.name,
			ignoreFocusOut: true,
			validateInput: value => Notes.validateName(value, safeName(value), folder.location, folder.name)
		});

		await Notes.renameEntry(folder, safeName(newFolderName ?? ''), tree);
	}

	// rename a note or folder in place; open editors follow the rename
	static async renameEntry(item: Note, newName: string, tree: NotesViewProvider): Promise<void> {
		// if no new name or the name didn't change, do nothing
		if (!newName || newName === item.name) {
			return;
		}

		const edit = new vscode.WorkspaceEdit();
		edit.renameFile(vscode.Uri.file(item.fullPath), vscode.Uri.file(path.join(item.location, newName)), { overwrite: false });

		let renamed = false;
		let reason = '';
		try {
			renamed = await vscode.workspace.applyEdit(edit);
		} catch (err) {
			reason = `: ${errorMessage(err)}`;
		}
		if (!renamed) {
			vscode.window.showErrorMessage(`Failed to rename '${item.name}' to '${newName}'${reason}.`);
			return;
		}

		// refresh tree after renaming
		tree.refresh();
	}

	// setup notes: pick a storage location, or open the settings once there is one
	static async setupNotes(): Promise<void> {
		if (Notes.getNotesLocation()) {
			await vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${Notes.extensionId}`);
			return;
		}
		await Notes.chooseNotesLocation();
	}

	// ask for a folder to store notes in; the configuration listener points the tree at it
	static async chooseNotesLocation(): Promise<string | undefined> {
		const fileUri = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			openLabel: 'Select'
		});
		if (!fileUri || !fileUri[0]) {
			return undefined;
		}

		const notesLocation = path.normalize(fileUri[0].fsPath);
		await vscode.workspace.getConfiguration('notes').update('notesLocation', notesLocation, vscode.ConfigurationTarget.Global);
		return notesLocation;
	}
}
