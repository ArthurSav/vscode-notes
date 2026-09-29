# Change Log

All notable changes to the "vscode-notes" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.0] - 2026-09-29

Forked as `arthursav.vscode-notes`, installed from source (not on the Marketplace).

### Fixed

* new notes failed when the name had a `/` (e.g. a date like 9/29), when the notes folder didn't exist yet, or when no notes folder was set (it tried to write to the root of the disk)
* the new note name box closed, dropping the note, whenever focus moved elsewhere
* new, renamed and deleted notes could be missing from the tree until a manual refresh
* new note with a note selected in the tree (instead of a folder) failed; it now goes next to that note
* `todo.md` became `todo.md.md`
* a single extension in `notes.notesExtensions` (e.g. `md`) showed no notes at all
* List Notes opened a note named "undefined" when dismissed, and listed folders but not the notes inside them
* the settings (gear) button opened an empty settings page
* errors now say why an operation failed

### Changed

* existing names are refused in the name box while typing, instead of after
* changing `notes.notesLocation` or `notes.notesExtensions` applies right away, no window reload
* notes added or removed outside VS Code (sync, git, another window) show up in the tree
* hidden folders such as `.git` are not shown
* deleting moves notes and folders to the trash (unless `files.enableTrash` is off), after a modal confirmation
* renaming keeps open editors on the renamed note
* `~` and `${userHome}` work in `notes.notesLocation`
* the extension always runs locally (`extensionKind: ui`), so a Remote SSH window still uses the notes folder on your machine
* integration tests run in the installed VS Code instead of downloading one

## [2.0.0] - 2025-03-26

### Added

* directory support

## changed

* note filetype support
* setup functionality
* icons

## [1.2.1] - 2023-12-28

### Added

* new sidebar icon

## [1.2.0] - 2023-12-27

### Added

* new Notes.notesDefaultNotesExtension setting to set extension of new notes. The default is `md`.
* new Notes.notesExtensions setting to allow Notes to detect different file types when generating a list of notes. Must be a comma separated list of file extensions eg: `md,markdown,txt` etc. The default is `md,markdown,txt`.

### Fixed

* Updated packages and requirements to latest versions.

## [1.1.0] - 2020-04-04

### Added

* activity bar icon
* view list of notes in selected location
* icon to create a new note
* rename a note
* delete a note

### Changed

* build extension using webpack to minify

## [1.0.0] - 2020-03-26

### Added

* set notes location
* create a new note
* list new notes

[Unreleased]: https://github.com/ArthurSav/vscode-notes/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/ArthurSav/vscode-notes/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/dionmunk/vscode-notes/compare/v1.2.1...v2.0.0
[1.2.1]: https://github.com/dionmunk/vscode-notes/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/dionmunk/vscode-notes/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/dionmunk/vscode-notes/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/dionmunk/vscode-notes/compare/v1.0.0
