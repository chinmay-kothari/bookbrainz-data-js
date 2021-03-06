/*
 * Copyright (C) 2015-2016  Ben Ockmore
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, write to the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 */

import Promise from 'bluebird';
import bookbrainzData from './bookshelf';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import faker from 'faker';
import {truncateTables} from '../lib/util';


chai.use(chaiAsPromised);
const {expect} = chai;
const {
	AliasSet, Annotation, Disambiguation, Edition, Editor, EditorType, Entity,
	Gender, IdentifierSet, RelationshipSet, Revision, bookshelf
} = bookbrainzData;

const genderData = {
	id: 1,
	name: 'test'
};
const editorTypeData = {
	id: 1,
	label: 'test_type'
};
const editorAttribs = {
	genderId: 1,
	id: 1,
	name: 'bob',
	typeId: 1
};
const setData = {id: 1};

const aBBID = faker.random.uuid();

const revisionAttribs = {
	authorId: 1,
	id: 1
};
const editionAttribs = {
	aliasSetId: 1,
	annotationId: 1,
	bbid: aBBID,
	disambiguationId: 1,
	identifierSetId: 1,
	relationshipSetId: 1,
	revisionId: 1
};

function createEdition() {
	return bookshelf.transaction(async function (transacting) {
		await new Revision(revisionAttribs)
			.save(null, {method: 'insert', transacting});
		await new Annotation({
			content: 'Test Annotation',
			id: 1,
			lastRevisionId: 1
		})
			.save(null, {method: 'insert', transacting});
		const edition = await new Edition(editionAttribs)
			.save(null, {method: 'insert', transacting});
		return edition;
	});
}

describe('Edition model', () => {
	beforeEach(
		() =>
			new Gender(genderData).save(null, {method: 'insert'})
				.then(
					() => new EditorType(editorTypeData)
						.save(null, {method: 'insert'})
				)
				.then(
					() => new Editor(editorAttribs)
						.save(null, {method: 'insert'})
				)
				.then(
					() => Promise.all([
						new AliasSet(setData)
							.save(null, {method: 'insert'}),
						new IdentifierSet(setData)
							.save(null, {method: 'insert'}),
						new RelationshipSet(setData)
							.save(null, {method: 'insert'}),
						new Disambiguation({
							comment: 'Test Disambiguation',
							id: 1
						})
							.save(null, {method: 'insert'}),
						new Entity({bbid: aBBID, type: 'Edition'})
							.save(null, {method: 'insert'})
					])
				)
	);

	afterEach(function truncate() {
		this.timeout(0); // eslint-disable-line babel/no-invalid-this

		return truncateTables(bookshelf, [
			'bookbrainz.entity',
			'bookbrainz.revision',
			'bookbrainz.alias',
			'bookbrainz.identifier',
			'bookbrainz.relationship',
			'bookbrainz.relationship_set',
			'bookbrainz.identifier_set',
			'bookbrainz.alias_set',
			'bookbrainz.annotation',
			'bookbrainz.disambiguation',
			'bookbrainz.editor',
			'bookbrainz.editor_type',
			'musicbrainz.gender'
		]);
	});

	it('should return a JSON object with correct keys when saved', async () => {
		const edition = await createEdition();
		await edition.refresh({
			withRelated: [
				'relationshipSet', 'aliasSet', 'identifierSet',
				'annotation', 'disambiguation', 'authorCredit'
			]
		});
		const editionJSON = edition.toJSON();

		expect(editionJSON).to.have.all.keys([
			'aliasSet', 'aliasSetId', 'annotation', 'annotationId', 'bbid',
			'authorCreditId', 'dataId', 'defaultAliasId', 'depth',
			'disambiguation', 'disambiguationId', 'formatId', 'height',
			'identifierSet', 'identifierSetId', 'languageSetId', 'master',
			'pages', 'editionGroupBbid', 'publisherSetId', 'relationshipSet',
			'relationshipSetId', 'releaseEventSetId', 'revisionId', 'statusId',
			'type', 'weight', 'width'
		]);
	});

	it('should automatically create an Edition Group if none has been passed', async () => {
		const edition = await createEdition();
		await edition.refresh({
			withRelated: [
				'relationshipSet', 'aliasSet', 'identifierSet',
				'annotation', 'disambiguation', 'authorCredit',
				'editionGroup'
			]
		});
		const editionJSON = edition.toJSON();

		expect(editionJSON.editionGroupBbid).to.be.a('string');
		expect(editionJSON.editionGroup.aliasSetId).to.equal(1);
		expect(editionJSON.editionGroup.revisionId).to.equal(1);
		expect(editionJSON.editionGroup.dataId).to.not.be.null;
	});

	it('should reject an Edition update if editionGroupBbid has been unset', async () => {
		const edition = await createEdition();

		let editionJSON = edition.toJSON();
		const firstEditionGroup = editionJSON.editionGroupBbid;
		expect(firstEditionGroup).to.be.a('string');

		expect(edition.save({editionGroupBbid: null}))
			.to.be.rejectedWith('EditionGroupBbid required in Edition update');

		await edition.refresh({withRelated: ['editionGroup']});
		editionJSON = edition.toJSON();
		expect(editionJSON.editionGroupBbid).to.equal(firstEditionGroup);
	});

	it('should return the master revision when multiple revisions exist',
		() => {
			/*
			 * Revision ID order is reversed so that result is not dependent on
			 * row order
			 */
			const revisionAttribs2 = {
				authorId: 1,
				id: 1
			};
			const editionAttribs2 = {
				aliasSetId: 1,
				bbid: aBBID,
				identifierSetId: 1,
				relationshipSetId: 1,
				revisionId: 1
			};

			const revisionOnePromise = new Revision(revisionAttribs2)
				.save(null, {method: 'insert'});

			const editionPromise = revisionOnePromise
				.then(
					() =>
						new Edition(editionAttribs2)
							.save(null, {method: 'insert'})
				)
				.then((model) => model.refresh())
				.then((author) => author.toJSON());

			const revisionTwoPromise = editionPromise
				.then(() => {
					revisionAttribs2.id = 2;
					return new Revision(revisionAttribs2)
						.save(null, {method: 'insert'});
				});

			const editionUpdatePromise = Promise.join(editionPromise,
				revisionTwoPromise, (edition) => {
					const editionUpdateAttribs = {
						bbid: edition.bbid,
						revisionId: 2
					};

					return new Edition(editionUpdateAttribs).save();
				})
				.then(
					(model) => new Edition({bbid: model.get('bbid')}).fetch()
				)
				.then((edition) => edition.toJSON());

			return Promise.all([
				expect(editionUpdatePromise)
					.to.eventually.have.property('revisionId', 2),
				expect(editionUpdatePromise)
					.to.eventually.have.property('master', true)
			]);
		});
});
