import * as vscode from 'vscode';
import * as fs from 'fs';
import * as gl from 'glob';
import * as path from 'path';
import { Note } from './note';
import { notesGlob } from './util';

export class NotesViewProvider implements vscode.TreeDataProvider<Note>, vscode.Disposable {

    private _onDidChangeTreeData: vscode.EventEmitter<Note | undefined> = new vscode.EventEmitter<Note | undefined>();
    readonly onDidChangeTreeData: vscode.Event<Note | undefined> = this._onDidChangeTreeData.event;
    private watcher: vscode.FileSystemWatcher | undefined;
    private refreshTimer: NodeJS.Timeout | undefined;

    // constructor for NotesViewProvider
    constructor(
        private notesLocation: string,
        private notesExtensions: string) {
    };

    // initialize NotesViewProvider
    public init(): NotesViewProvider {
        this.configure(this.notesLocation, this.notesExtensions);
        return this;
    }

    // point the tree at a (possibly new) notes location, no window reload needed
    configure(notesLocation: string, notesExtensions: string): void {
        this.notesLocation = notesLocation;
        this.notesExtensions = notesExtensions;

        // watch the notes location so notes added, renamed or deleted outside the tree show up
        this.watcher?.dispose();
        this.watcher = undefined;
        if (notesLocation) {
            this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(notesLocation), '**/*'));
            this.watcher.onDidCreate(() => this.scheduleRefresh());
            this.watcher.onDidDelete(() => this.scheduleRefresh());
        }

        this.refresh();
    }

    // refresh the tree view
    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    // file events arrive in bursts, refresh once they settle
    private scheduleRefresh(): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        this.refreshTimer = setTimeout(() => this.refresh(), 100);
    }

    dispose(): void {
        this.watcher?.dispose();
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        this._onDidChangeTreeData.dispose();
    }

    // get the parent of a note
    getTreeItem(note: Note): vscode.TreeItem {
        return note;
    }

    // get the children of a note
    getChildren(note?: Note): Thenable<Note[]> {
        // if there is no notes location return an empty list
        if (!this.notesLocation) {
            return Promise.resolve([]);
        }

        // if there is a parent note and it's a folder
        if (note && note.isFolder) {
            // Return the children of this folder
            return Promise.resolve(this.getNotes(note.fullPath, this.notesExtensions));
        }
        // if there is a note but it's not a folder, return empty list
        else if (note) {
            return Promise.resolve([]);
        }
        // else return the list of notes at the root level
        else {
            return Promise.resolve(this.getNotes(this.notesLocation, this.notesExtensions));
        }
    }

    // get the notes in the notes location
    getNotes(notesLocation: string, notesExtensions: string): Note[] {
        // if the notes location exists
        if (this.pathExists(notesLocation)) {
            const result: Note[] = [];

            // First, add all folders
            try {
                const items = fs.readdirSync(notesLocation, { withFileTypes: true });

                // Add folders first, skipping hidden ones like .git (the glob below skips hidden files too)
                for (const item of items) {
                    if (item.isDirectory() && !item.name.startsWith('.')) {
                        const folderNote = new Note(
                            item.name,
                            notesLocation,
                            '', // category
                            '', // tags
                            true // isDirectory
                        );
                        result.push(folderNote);
                    }
                }

                // Then add notes
                const listOfNotes = (note: string): Note => {
                    // return a note with the given note name, notes location, empty category, empty tags, and the command to open the note
                    return new Note(
                        path.basename(note),
                        notesLocation,
                        '', // category
                        '', // tags
                        false, // isDirectory
                        {
                            command: 'Notes.openNote',
                            title: '',
                            arguments: [path.join(notesLocation, note)]
                        });
                };

                // get the list of notes in the notes location
                const notes = gl.sync(notesGlob(notesExtensions), { cwd: notesLocation, nodir: true, nocase: true }).map(listOfNotes);
                result.push(...notes);
            } catch (err) {
                console.error('Error reading directory:', err);
            }

            // Sort: folders first, then notes alphabetically
            result.sort((a, b) => {
                if (a.isFolder && !b.isFolder) {
                    return -1;
                }
                if (!a.isFolder && b.isFolder) {
                    return 1;
                }
                return a.name.localeCompare(b.name, undefined, { numeric: true });
            });

            return result;
        }
        // else if the notes location does not exist
        else {
            // return an empty list
            return [];
        }
    }

    // check if a path exists
    private pathExists(p: string): boolean {
        // try to access the given location
        try {
            fs.accessSync(p);
            // return false if location does not exist
        } catch (err) {
            return false;
        }
        // return true if location exists
        return true;
    }

}
