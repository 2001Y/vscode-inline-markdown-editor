import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('inlinemark.inlinemark'));
  });

  test('Extension should activate on markdown file', async () => {
    const extension = vscode.extensions.getExtension('inlinemark.inlinemark');
    if (extension) {
      await extension.activate();
      assert.strictEqual(extension.isActive, true);
    }
  });

  test('Commands should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);

    assert.ok(commands.includes('inlineMark.resetSession'), 'resetSession command should be registered');
    assert.ok(commands.includes('inlineMark.reopenWithTextEditor'), 'reopenWithTextEditor command should be registered');
    assert.ok(commands.includes('inlineMark.applyRequiredSettings'), 'applyRequiredSettings command should be registered');
    assert.ok(commands.includes('inlineMark.exportLogs'), 'exportLogs command should be registered');
  });

  test('Configuration should have default values', () => {
    const config = vscode.workspace.getConfiguration('inlineMark');

    assert.strictEqual(config.get('sync.debounceMs'), 250, 'debounceMs should default to 250');
    assert.strictEqual(config.get('sync.timeoutMs'), 3000, 'timeoutMs should default to 3000');
    assert.strictEqual(config.get('sync.changeGuard.maxChangedRatio'), 0.5, 'maxChangedRatio should default to 0.5');
    assert.strictEqual(config.get('security.allowWorkspaceImages'), true, 'allowWorkspaceImages should default to true');
    assert.strictEqual(config.get('security.allowRemoteImages'), false, 'allowRemoteImages should default to false');
    assert.strictEqual(config.get('security.renderHtml'), false, 'renderHtml should default to false');
    assert.strictEqual(config.get('security.confirmExternalLinks'), true, 'confirmExternalLinks should default to true');
    assert.strictEqual(config.get('debug.enabled'), false, 'debug.enabled should default to false');
  });
});
