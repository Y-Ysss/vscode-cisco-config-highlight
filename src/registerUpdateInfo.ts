import * as vscode from 'vscode';
import * as semver from 'semver';
import { notificationConditions, NotificationInfo } from './notificationConditions';


export function registerUpdateInfo(context: vscode.ExtensionContext) {
    // console.log('Hello');
    const versionKey = `previous_version`;
    context.globalState.setKeysForSync([versionKey]);

    // https://code.visualstudio.com/api/extension-capabilities/common-capabilities
    const previousVersion: string | undefined = context.globalState.get(versionKey);
    const currentVersion = context.extension.packageJSON.version;
    context.globalState.update(versionKey, currentVersion);
    // context.globalState.update(versionKey, '0.3.6');   // -----------------------------DEBUG
    // console.log(context.globalState.keys());
    console.log(previousVersion, currentVersion);

    if (previousVersion && isIgnore(previousVersion, currentVersion)) {
        return;
    }
    notificationConditions.forEach(info => {
        if (!previousVersion || semver.satisfies(previousVersion, info.version_info)) {
            let prev = previousVersion ? previousVersion : 'undefined'
            let message = info.messege.split('${previousVersion}').join(prev);
            message = message.split('${currentVersion}').join(currentVersion);
            const dialog = getDialog(info, message);
            dialog.then(() => {
                info.action(prev, currentVersion);
            });
        }
    });
}

function getDialog(info: NotificationInfo, message: string): Thenable<string | undefined> {
    if (info.type === 'info') {
        return vscode.window.showInformationMessage(
            message,
            info.button_label,
        );
    } else if (info.type === 'warn') {
        return vscode.window.showWarningMessage(
            message,
            info.button_label,
        );
    } else {
        return vscode.window.showInformationMessage(
            message,
            info.button_label,
        );
    }
}

function isIgnore(previousVersion: string, currentVersion: string): boolean {
    const isLessThan = semver.lt(previousVersion, currentVersion);
    if (isLessThan) {
        const differs: semver.ReleaseType | null = semver.diff(previousVersion, currentVersion);

        if (!differs || differs === "patch") {
            return true;
        }
    }
    return !isLessThan
}
