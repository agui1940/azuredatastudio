/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'vs/base/common/path';
import * as os from 'os';
import * as assert from 'assert';
import { FileService } from 'vs/workbench/services/files/node/fileService';
import { FileOperation, FileOperationEvent, FileChangesEvent, FileOperationResult, FileOperationError } from 'vs/platform/files/common/files';
import { URI as uri } from 'vs/base/common/uri';
import * as uuid from 'vs/base/common/uuid';
import * as pfs from 'vs/base/node/pfs';
import * as encodingLib from 'vs/base/node/encoding';
import { TestEnvironmentService, TestContextService, TestTextResourceConfigurationService, TestLifecycleService, TestStorageService } from 'vs/workbench/test/workbenchTestServices';
import { getRandomTestPath } from 'vs/base/test/node/testUtils';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import { Workspace, toWorkspaceFolders } from 'vs/platform/workspace/common/workspace';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TextModel } from 'vs/editor/common/model/textModel';
import { IEncodingOverride } from 'vs/workbench/services/files/node/encoding';
import { getPathFromAmdModule } from 'vs/base/common/amd';

suite('FileService', () => {
	let service: FileService;
	const parentDir = getRandomTestPath(os.tmpdir(), 'vsctests', 'fileservice');
	let testDir: string;

	setup(function () {
		const id = uuid.generateUuid();
		testDir = path.join(parentDir, id);
		const sourceDir = getPathFromAmdModule(require, './fixtures/service');

		return pfs.copy(sourceDir, testDir).then(() => {
			service = new FileService(new TestContextService(new Workspace(testDir, toWorkspaceFolders([{ path: testDir }]))), TestEnvironmentService, new TestTextResourceConfigurationService(), new TestConfigurationService(), new TestLifecycleService(), new TestStorageService(), new TestNotificationService(), { disableWatcher: true });
		});
	});

	teardown(() => {
		service.dispose();
		return pfs.del(parentDir, os.tmpdir());
	});

	test('createFile', () => {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const contents = 'Hello World';
		const resource = uri.file(path.join(testDir, 'test.txt'));
		return service.createFile(resource, contents).then(s => {
			assert.equal(s.name, 'test.txt');
			assert.equal(fs.existsSync(s.resource.fsPath), true);
			assert.equal(fs.readFileSync(s.resource.fsPath), contents);

			assert.ok(event);
			assert.equal(event.resource.fsPath, resource.fsPath);
			assert.equal(event.operation, FileOperation.CREATE);
			assert.equal(event.target!.resource.fsPath, resource.fsPath);
			toDispose.dispose();
		});
	});

	test('createFile (does not overwrite by default)', function () {
		const contents = 'Hello World';
		const resource = uri.file(path.join(testDir, 'test.txt'));

		fs.writeFileSync(resource.fsPath, ''); // create file

		return service.createFile(resource, contents).then(undefined, error => {
			assert.ok(error);
		});
	});

	test('createFile (allows to overwrite existing)', function () {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const contents = 'Hello World';
		const resource = uri.file(path.join(testDir, 'test.txt'));

		fs.writeFileSync(resource.fsPath, ''); // create file

		return service.createFile(resource, contents, { overwrite: true }).then(s => {
			assert.equal(s.name, 'test.txt');
			assert.equal(fs.existsSync(s.resource.fsPath), true);
			assert.equal(fs.readFileSync(s.resource.fsPath), contents);

			assert.ok(event);
			assert.equal(event.resource.fsPath, resource.fsPath);
			assert.equal(event.operation, FileOperation.CREATE);
			assert.equal(event.target!.resource.fsPath, resource.fsPath);
			toDispose.dispose();
		});
	});

	test('updateContent', () => {
		const resource = uri.file(path.join(testDir, 'small.txt'));

		return service.resolveContent(resource).then(c => {
			assert.equal(c.value, 'Small File');

			c.value = 'Updates to the small file';

			return service.updateContent(c.resource, c.value).then(c => {
				assert.equal(fs.readFileSync(resource.fsPath), 'Updates to the small file');
			});
		});
	});

	test('updateContent (ITextSnapShot)', function () {
		const resource = uri.file(path.join(testDir, 'small.txt'));

		return service.resolveContent(resource).then(c => {
			assert.equal(c.value, 'Small File');

			const model = TextModel.createFromString('Updates to the small file');

			return service.updateContent(c.resource, model.createSnapshot()).then(c => {
				assert.equal(fs.readFileSync(resource.fsPath), 'Updates to the small file');

				model.dispose();
			});
		});
	});

	test('updateContent (large file)', function () {
		const resource = uri.file(path.join(testDir, 'lorem.txt'));

		return service.resolveContent(resource).then(c => {
			const newValue = c.value + c.value;
			c.value = newValue;

			return service.updateContent(c.resource, c.value).then(c => {
				assert.equal(fs.readFileSync(resource.fsPath), newValue);
			});
		});
	});

	test('updateContent (large file, ITextSnapShot)', function () {
		const resource = uri.file(path.join(testDir, 'lorem.txt'));

		return service.resolveContent(resource).then(c => {
			const newValue = c.value + c.value;
			const model = TextModel.createFromString(newValue);

			return service.updateContent(c.resource, model.createSnapshot()).then(c => {
				assert.equal(fs.readFileSync(resource.fsPath), newValue);
			});
		});
	});

	test('updateContent - use encoding (UTF 16 BE)', function () {
		const resource = uri.file(path.join(testDir, 'small.txt'));
		const encoding = 'utf16be';

		return service.resolveContent(resource).then(c => {
			c.encoding = encoding;

			return service.updateContent(c.resource, c.value, { encoding: encoding }).then(c => {
				return encodingLib.detectEncodingByBOM(c.resource.fsPath).then((enc) => {
					assert.equal(enc, encodingLib.UTF16be);

					return service.resolveContent(resource).then(c => {
						assert.equal(c.encoding, encoding);
					});
				});
			});
		});
	});

	test('updateContent - use encoding (UTF 16 BE, ITextSnapShot)', function () {
		const resource = uri.file(path.join(testDir, 'small.txt'));
		const encoding = 'utf16be';

		return service.resolveContent(resource).then(c => {
			c.encoding = encoding;

			const model = TextModel.createFromString(c.value);

			return service.updateContent(c.resource, model.createSnapshot(), { encoding: encoding }).then(c => {
				return encodingLib.detectEncodingByBOM(c.resource.fsPath).then((enc) => {
					assert.equal(enc, encodingLib.UTF16be);

					return service.resolveContent(resource).then(c => {
						assert.equal(c.encoding, encoding);

						model.dispose();
					});
				});
			});
		});
	});

	test('updateContent - encoding preserved (UTF 16 LE)', function () {
		const encoding = 'utf16le';
		const resource = uri.file(path.join(testDir, 'some_utf16le.css'));

		return service.resolveContent(resource).then(c => {
			assert.equal(c.encoding, encoding);

			c.value = 'Some updates';

			return service.updateContent(c.resource, c.value, { encoding: encoding }).then(c => {
				return encodingLib.detectEncodingByBOM(c.resource.fsPath).then((enc) => {
					assert.equal(enc, encodingLib.UTF16le);

					return service.resolveContent(resource).then(c => {
						assert.equal(c.encoding, encoding);
					});
				});
			});
		});
	});

	test('updateContent - encoding preserved (UTF 16 LE, ITextSnapShot)', function () {
		const encoding = 'utf16le';
		const resource = uri.file(path.join(testDir, 'some_utf16le.css'));

		return service.resolveContent(resource).then(c => {
			assert.equal(c.encoding, encoding);

			const model = TextModel.createFromString('Some updates');

			return service.updateContent(c.resource, model.createSnapshot(), { encoding: encoding }).then(c => {
				return encodingLib.detectEncodingByBOM(c.resource.fsPath).then((enc) => {
					assert.equal(enc, encodingLib.UTF16le);

					return service.resolveContent(resource).then(c => {
						assert.equal(c.encoding, encoding);

						model.dispose();
					});
				});
			});
		});
	});

	test('resolveContent - large file', function () {
		const resource = uri.file(path.join(testDir, 'lorem.txt'));

		return service.resolveContent(resource).then(c => {
			assert.ok(c.value.length > 64000);
		});
	});

	test('Files are intermingled #38331', function () {
		let resource1 = uri.file(path.join(testDir, 'lorem.txt'));
		let resource2 = uri.file(path.join(testDir, 'some_utf16le.css'));
		let value1: string;
		let value2: string;
		// load in sequence and keep data
		return service.resolveContent(resource1).then(c => value1 = c.value).then(() => {
			return service.resolveContent(resource2).then(c => value2 = c.value);
		}).then(() => {
			// load in parallel in expect the same result
			return Promise.all([
				service.resolveContent(resource1).then(c => assert.equal(c.value, value1)),
				service.resolveContent(resource2).then(c => assert.equal(c.value, value2))
			]);
		});
	});

	test('resolveContent - FILE_IS_BINARY', function () {
		const resource = uri.file(path.join(testDir, 'binary.txt'));

		return service.resolveContent(resource, { acceptTextOnly: true }).then(undefined, (e: FileOperationError) => {
			assert.equal(e.fileOperationResult, FileOperationResult.FILE_IS_BINARY);

			return service.resolveContent(uri.file(path.join(testDir, 'small.txt')), { acceptTextOnly: true }).then(r => {
				assert.equal(r.name, 'small.txt');
			});
		});
	});

	test('resolveContent - FILE_IS_DIRECTORY', function () {
		const resource = uri.file(path.join(testDir, 'deep'));

		return service.resolveContent(resource).then(undefined, (e: FileOperationError) => {
			assert.equal(e.fileOperationResult, FileOperationResult.FILE_IS_DIRECTORY);
		});
	});

	test('resolveContent - FILE_NOT_FOUND', function () {
		const resource = uri.file(path.join(testDir, '404.html'));

		return service.resolveContent(resource).then(undefined, (e: FileOperationError) => {
			assert.equal(e.fileOperationResult, FileOperationResult.FILE_NOT_FOUND);
		});
	});

	test('resolveContent - FILE_NOT_MODIFIED_SINCE', function () {
		const resource = uri.file(path.join(testDir, 'index.html'));

		return service.resolveContent(resource).then(c => {
			return service.resolveContent(resource, { etag: c.etag }).then(undefined, (e: FileOperationError) => {
				assert.equal(e.fileOperationResult, FileOperationResult.FILE_NOT_MODIFIED_SINCE);
			});
		});
	});

	test('resolveContent - FILE_MODIFIED_SINCE', function () {
		const resource = uri.file(path.join(testDir, 'index.html'));

		return service.resolveContent(resource).then(c => {
			fs.writeFileSync(resource.fsPath, 'Updates Incoming!');

			return service.updateContent(resource, c.value, { etag: c.etag, mtime: c.mtime - 1000 }).then(undefined, (e: FileOperationError) => {
				assert.equal(e.fileOperationResult, FileOperationResult.FILE_MODIFIED_SINCE);
			});
		});
	});

	test('resolveContent - encoding picked up', function () {
		const resource = uri.file(path.join(testDir, 'index.html'));
		const encoding = 'windows1252';

		return service.resolveContent(resource, { encoding: encoding }).then(c => {
			assert.equal(c.encoding, encoding);
		});
	});

	test('resolveContent - user overrides BOM', function () {
		const resource = uri.file(path.join(testDir, 'some_utf16le.css'));

		return service.resolveContent(resource, { encoding: 'windows1252' }).then(c => {
			assert.equal(c.encoding, 'windows1252');
		});
	});

	test('resolveContent - BOM removed', function () {
		const resource = uri.file(path.join(testDir, 'some_utf8_bom.txt'));

		return service.resolveContent(resource).then(c => {
			assert.equal(encodingLib.detectEncodingByBOMFromBuffer(Buffer.from(c.value), 512), null);
		});
	});

	test('resolveContent - invalid encoding', function () {
		const resource = uri.file(path.join(testDir, 'index.html'));

		return service.resolveContent(resource, { encoding: 'superduper' }).then(c => {
			assert.equal(c.encoding, 'utf8');
		});
	});

	test('watch', function (done) {
		const toWatch = uri.file(path.join(testDir, 'index.html'));

		service.watch(toWatch);

		service.onFileChanges((e: FileChangesEvent) => {
			assert.ok(e);

			service.unwatch(toWatch);
			done();
		});

		setTimeout(() => {
			fs.writeFileSync(toWatch.fsPath, 'Changes');
		}, 100);
	});

	// test('watch - support atomic save', function (done) {
	// 	const toWatch = uri.file(path.join(testDir, 'index.html'));

	// 	service.watch(toWatch);

	// 	service.onFileChanges((e: FileChangesEvent) => {
	// 		assert.ok(e);

	// 		service.unwatch(toWatch);
	// 		done();
	// 	});

	// 	setTimeout(() => {
	// 		// Simulate atomic save by deleting the file, creating it under different name
	// 		// and then replacing the previously deleted file with those contents
	// 		const renamed = `${toWatch.fsPath}.bak`;
	// 		fs.unlinkSync(toWatch.fsPath);
	// 		fs.writeFileSync(renamed, 'Changes');
	// 		fs.renameSync(renamed, toWatch.fsPath);
	// 	}, 100);
	// });

	test('options - encoding override (parent)', function () {

		// setup
		const _id = uuid.generateUuid();
		const _testDir = path.join(parentDir, _id);
		const _sourceDir = getPathFromAmdModule(require, './fixtures/service');

		return pfs.copy(_sourceDir, _testDir).then(() => {
			const encodingOverride: IEncodingOverride[] = [];
			encodingOverride.push({
				parent: uri.file(path.join(testDir, 'deep')),
				encoding: 'utf16le'
			});

			const configurationService = new TestConfigurationService();
			configurationService.setUserConfiguration('files', { encoding: 'windows1252' });

			const textResourceConfigurationService = new TestTextResourceConfigurationService(configurationService);

			const _service = new FileService(
				new TestContextService(new Workspace(_testDir, toWorkspaceFolders([{ path: _testDir }]))),
				TestEnvironmentService,
				textResourceConfigurationService,
				configurationService,
				new TestLifecycleService(),
				new TestStorageService(),
				new TestNotificationService(),
				{
					encodingOverride,
					disableWatcher: true
				});

			return _service.resolveContent(uri.file(path.join(testDir, 'index.html'))).then(c => {
				assert.equal(c.encoding, 'windows1252');

				return _service.resolveContent(uri.file(path.join(testDir, 'deep', 'conway.js'))).then(c => {
					assert.equal(c.encoding, 'utf16le');

					// teardown
					_service.dispose();
				});
			});
		});
	});

	test('options - encoding override (extension)', function () {

		// setup
		const _id = uuid.generateUuid();
		const _testDir = path.join(parentDir, _id);
		const _sourceDir = getPathFromAmdModule(require, './fixtures/service');

		return pfs.copy(_sourceDir, _testDir).then(() => {
			const encodingOverride: IEncodingOverride[] = [];
			encodingOverride.push({
				extension: 'js',
				encoding: 'utf16le'
			});

			const configurationService = new TestConfigurationService();
			configurationService.setUserConfiguration('files', { encoding: 'windows1252' });

			const textResourceConfigurationService = new TestTextResourceConfigurationService(configurationService);

			const _service = new FileService(
				new TestContextService(new Workspace(_testDir, toWorkspaceFolders([{ path: _testDir }]))),
				TestEnvironmentService,
				textResourceConfigurationService,
				configurationService,
				new TestLifecycleService(),
				new TestStorageService(),
				new TestNotificationService(),
				{
					encodingOverride,
					disableWatcher: true
				});

			return _service.resolveContent(uri.file(path.join(testDir, 'index.html'))).then(c => {
				assert.equal(c.encoding, 'windows1252');

				return _service.resolveContent(uri.file(path.join(testDir, 'deep', 'conway.js'))).then(c => {
					assert.equal(c.encoding, 'utf16le');

					// teardown
					_service.dispose();
				});
			});
		});
	});

	test('UTF 8 BOMs', function () {

		// setup
		const _id = uuid.generateUuid();
		const _testDir = path.join(parentDir, _id);
		const _sourceDir = getPathFromAmdModule(require, './fixtures/service');
		const resource = uri.file(path.join(testDir, 'index.html'));

		const _service = new FileService(
			new TestContextService(new Workspace(_testDir, toWorkspaceFolders([{ path: _testDir }]))),
			TestEnvironmentService,
			new TestTextResourceConfigurationService(),
			new TestConfigurationService(),
			new TestLifecycleService(),
			new TestStorageService(),
			new TestNotificationService(),
			{
				disableWatcher: true
			});

		return pfs.copy(_sourceDir, _testDir).then(() => {
			return pfs.readFile(resource.fsPath).then(data => {
				assert.equal(encodingLib.detectEncodingByBOMFromBuffer(data, 512), null);

				const model = TextModel.createFromString('Hello Bom');

				// Update content: UTF_8 => UTF_8_BOM
				return _service.updateContent(resource, model.createSnapshot(), { encoding: encodingLib.UTF8_with_bom }).then(() => {
					return pfs.readFile(resource.fsPath).then(data => {
						assert.equal(encodingLib.detectEncodingByBOMFromBuffer(data, 512), encodingLib.UTF8);

						// Update content: PRESERVE BOM when using UTF-8
						model.setValue('Please stay Bom');
						return _service.updateContent(resource, model.createSnapshot(), { encoding: encodingLib.UTF8 }).then(() => {
							return pfs.readFile(resource.fsPath).then(data => {
								assert.equal(encodingLib.detectEncodingByBOMFromBuffer(data, 512), encodingLib.UTF8);

								// Update content: REMOVE BOM
								model.setValue('Go away Bom');
								return _service.updateContent(resource, model.createSnapshot(), { encoding: encodingLib.UTF8, overwriteEncoding: true }).then(() => {
									return pfs.readFile(resource.fsPath).then(data => {
										assert.equal(encodingLib.detectEncodingByBOMFromBuffer(data, 512), null);

										// Update content: BOM comes not back
										model.setValue('Do not come back Bom');
										return _service.updateContent(resource, model.createSnapshot(), { encoding: encodingLib.UTF8 }).then(() => {
											return pfs.readFile(resource.fsPath).then(data => {
												assert.equal(encodingLib.detectEncodingByBOMFromBuffer(data, 512), null);

												model.dispose();
												_service.dispose();
											});
										});
									});
								});
							});
						});
					});
				});
			});
		});
	});

	test('resolveContent - from position (ASCII)', function () {
		const resource = uri.file(path.join(testDir, 'small.txt'));

		return service.resolveContent(resource, { position: 6 }).then(content => {
			assert.equal(content.value, 'File');
		});
	});

	test('resolveContent - from position (with umlaut)', function () {
		const resource = uri.file(path.join(testDir, 'small_umlaut.txt'));

		return service.resolveContent(resource, { position: Buffer.from('Small File with Ü').length }).then(content => {
			assert.equal(content.value, 'mlaut');
		});
	});
});
