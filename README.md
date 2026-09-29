# Notes

[![Creative Commons](https://flat.badgen.net/badge/license/CC-BY-NC-4.0/orange)](https://creativecommons.org/licenses/by-nc/4.0/)

Notes is a Markdown focused notes extension for Visual Studio Code that takes inspiration from Notational Velocity and nvAlt.

This is a fork of [dionmunk/vscode-notes](https://github.com/dionmunk/vscode-notes) by Dion Munk, with bug fixes. It is not published to the Marketplace; build and install it from source (see [Install from source](#install-from-source)).

![Notes Demo](/screenshots/screenshot.png?raw=true "Notes Demo")

## Features

Notes are stored in a single location (directory) located anywhere on your system you'd like. This allows you to store notes locally or inside a cloud service like Dropbox, iCloud Drive, Google Drive, OneDrive, etc. Notes are written in Markdown and are stored as **.md** by default, but you can change this to whatever you want. It's recommended to name your notes with a file extension, like **.md**, or VS Code won't know how to render your note correctly.

The extension can be accessed using the Notes icon that is placed in the Activity Bar, or in the Command Pallet (CMD+Shift+P or CTRL+Shift+P) by typing `Notes`.

* quickly create new notes by using the `Alt+N` shortcut, or by click on the `+` icon at the top when you are in Notes. Right-click a folder to create a note inside it.
* quickly access your list of notes by using the `Alt+L` shortcut to bring up a searchable list at the top of VSCode.
* right-clicking a note or folder inside Notes lets you rename or delete it. Deleted notes go to the trash, unless `files.enableTrash` is turned off.

## Getting Started

Notes will prompt you for a storage location the first time you access the extension from the Activity Bar or through the Command Pallet. If you would like to change the storage location, later on, you can access the Notes extension settings by clicking on the gear icon in Notes or from the Command Pallet. After you've selected a storage location, you can access your notes from the Notes icon in the Activity Bar, or through the Command Pallet.

## Install from source

```sh
npm install
npx @vscode/vsce package
code --install-extension vscode-notes-<version>.vsix
```

If the original `dionmunk.vscode-notes` is installed, uninstall it first: both contribute the same commands and view.

`npm test` runs the integration tests in the VS Code you have installed, in a separate throwaway profile under `.vscode-test/` (set `VSCODE_EXECUTABLE` if VS Code is somewhere else).

## Extension Settings

This extension contributes the following settings:

* `notes.notesLocation`: location where notes are stored (`~` means your home folder); changes apply without reloading
* `notes.notesDefaultNoteExtension`: extension used for new notes
* `notes.notesExtensions`: list of extensions recognized as notes or '*' for all extensions

## Future Plans

* custom Notes editor with shortcuts for common Markdown functions (bold, italic, link, code block, etc.)
* option to have an automatic Markdown preview pop up when you start editing a note
* search notes in the Notes view using note name and contents
* allow for front matter in Notes like tags and categories (with possible tree structure based on tags and categories)
* allow for multiple Notes' storage locations and make them switchable

## License

This work is licensed under a [Creative Commons Attribution-NonCommercial 4.0 International License](https://creativecommons.org/licenses/by-nc/4.0/).
