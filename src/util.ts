import * as os from 'os';
import * as path from 'path';

// expand a leading ~ or ${userHome} in a configured path
export function expandHome(location: string): string {
	const home = os.homedir();
	return location
		.replace(/^\$\{userHome\}/, home)
		.replace(/^~(?=$|[\/\\])/, home);
}

// parse the notesExtensions setting: [] means every extension is allowed ('*')
export function extensionList(extensions: string): string[] {
	const list = extensions.split(',').map(e => e.trim().replace(/^\.+/, '').toLowerCase()).filter(Boolean);
	return list.length === 0 || list.includes('*') ? [] : list;
}

// glob pattern matching note files; a single extension can't go in braces, '*.{md}' matches nothing
export function notesGlob(extensions: string, recursive = false): string {
	const prefix = recursive ? '**/' : '';
	const list = extensionList(extensions);
	if (list.length === 0) {
		return `${prefix}*`;
	}
	return list.length === 1 ? `${prefix}*.${list[0]}` : `${prefix}*.{${list.join(',')}}`;
}

// make a typed name safe to use as a single file or folder name
export function safeName(name: string): string {
	return name
		.replace(/[\/\\]/g, '-')
		.replace(/[:*?"<>|\x00-\x1f]/g, '')
		// a leading dot would hide the note, trailing dots and spaces confuse some file systems
		.replace(/^[.\s]+/, '')
		.replace(/[.\s]+$/, '');
}

// file name for a note typed as `name`: keeps a typed extension when it's the default or an allowed one,
// otherwise appends the default extension ('todo.md' stays 'todo.md', 'v1.2' becomes 'v1.2.md')
export function noteFileName(name: string, defaultExtension: string, extensions: string): string {
	const base = safeName(name);
	if (!base) {
		return '';
	}
	const extension = defaultExtension.trim().replace(/^\.+/, '') || 'md';
	const typed = path.extname(base).slice(1).toLowerCase();
	if (typed && (typed === extension.toLowerCase() || extensionList(extensions).includes(typed))) {
		return base;
	}
	return `${base}.${extension}`;
}

// message from an unknown thrown value
export function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
