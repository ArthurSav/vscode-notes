import * as fs from 'fs';
import * as path from 'path';

import { runTests } from 'vscode-test';

// the tests run in the VS Code that's already installed; nothing gets downloaded
const installedVSCode: { [platform: string]: string } = {
	darwin: '/Applications/Visual Studio Code.app/Contents/MacOS/Code',
	linux: '/usr/share/code/code',
	win32: path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'Code.exe')
};

async function main() {
	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, '../../');

		// The path to test runner
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './suite/index');

		const vscodeExecutablePath = process.env.VSCODE_EXECUTABLE || installedVSCode[process.platform];
		if (!vscodeExecutablePath || !fs.existsSync(vscodeExecutablePath)) {
			console.error(`VS Code not found at '${vscodeExecutablePath}'. Set VSCODE_EXECUTABLE to the VS Code binary to test with.`);
			process.exit(1);
		}

		// launched from a VS Code terminal these would start VS Code as plain Node or hand off to the open window
		for (const name of Object.keys(process.env)) {
			if (name === 'ELECTRON_RUN_AS_NODE' || name.startsWith('VSCODE_')) {
				delete process.env[name];
			}
		}

		// a fresh profile of its own, with no extensions, keeps the tests away from your settings, extensions and windows
		// (--disable-extensions isn't needed with it, and would show an alarming "extensions are disabled" banner)
		const profile = path.resolve(extensionDevelopmentPath, '.vscode-test');
		fs.rmSync(path.join(profile, 'user-data'), { recursive: true, force: true });

		await runTests({
			vscodeExecutablePath,
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: [
				`--user-data-dir=${path.join(profile, 'user-data')}`,
				`--extensions-dir=${path.join(profile, 'extensions')}`,
				'--disable-workspace-trust',
				'--skip-welcome',
				'--skip-release-notes'
			]
		});
	} catch (err) {
		console.error('Failed to run tests', err);
		process.exit(1);
	}
}

main();
