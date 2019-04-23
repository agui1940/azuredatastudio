/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import * as azdata from 'azdata';
import * as vscode from 'vscode';
import { TestServerProfile } from './testConfig';

export async function connectToServer(server: TestServerProfile, timeout: number = 3000) {
	let connectionProfile: azdata.IConnectionProfile = {
		serverName: server.serverName,
		databaseName: server.database,
		authenticationType: server.authenticationTypeName,
		providerName: server.providerName,
		connectionName: '',
		userName: server.userName,
		password: server.password,
		savePassword: false,
		groupFullName: undefined,
		saveProfile: true,
		id: undefined,
		groupId: undefined,
		options: {}
	};
	await ensureConnectionViewOpened();
	let result = <azdata.ConnectionResult>await azdata.connection.connect(connectionProfile);
	assert(result.connected, `Failed to connect to "${connectionProfile.serverName}", error code: ${result.errorCode}, error message: ${result.errorMessage}`);

	//workaround
	//wait for OE to load
	await new Promise(c => setTimeout(c, timeout));
}

export async function ensureConnectionViewOpened() {
	await vscode.commands.executeCommand('dataExplorer.servers.focus');
}

export async function sleep(ms: number): Promise<{}> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export async function createDB(dbName: string, ownerUri: string): Promise<void> {
	let queryProvider = azdata.dataprotocol.getProvider<azdata.QueryProvider>('MSSQL', azdata.DataProviderType.QueryProvider);
	let query = `BEGIN TRY
			CREATE DATABASE ${dbName}
			SELECT 1 AS NoError
		END TRY
		BEGIN CATCH
			SELECT ERROR_MESSAGE() AS ErrorMessage;
		END CATCH`;

	let dbcreatedResult = await queryProvider.runQueryAndReturn(ownerUri, query);
	assert(dbcreatedResult.columnInfo[0].columnName !== 'ErrorMessage', 'DB creation threw error');
}

export async function deleteDB(dbName: string, ownerUri: string): Promise<void> {
	let queryProvider = azdata.dataprotocol.getProvider<azdata.QueryProvider>('MSSQL', azdata.DataProviderType.QueryProvider);
	let query = `BEGIN TRY
			DROP DATABASE ${dbName}
			SELECT 1 AS NoError
		END TRY
		BEGIN CATCH
			SELECT ERROR_MESSAGE() AS ErrorMessage;
		END CATCH`;

	let dbcreatedResult = await queryProvider.runQueryAndReturn(ownerUri, query);
	assert(dbcreatedResult.columnInfo[0].columnName !== 'ErrorMessage', 'DB deletion threw error');
}