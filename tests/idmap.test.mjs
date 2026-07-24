import assert from 'node:assert/strict'
import test from 'node:test'
import { aliasSnapshot } from '../scripts/lib/idmap.mjs'

test('aliases numeric GitHub source identifiers as strings', () => {
  const previousSalt = process.env.CF_ALIAS_SALT
  process.env.CF_ALIAS_SALT = '11'.repeat(32)

  try {
    const raw = {
      account: { id: 'a'.repeat(32) },
      resources: {
        pages: [{
          id: 'project-id',
          name: 'sample-private-repository',
          source: {
            config: {
              owner: 'sample-owner',
              owner_id: 123456789,
              repo_name: 'sample-private-repository',
              repo_id: 987654321,
            },
          },
        }],
      },
      zones: [],
    }
    const vault = { version: 1, saltFingerprint: null, entries: {} }

    const { aliased } = aliasSnapshot(raw, vault)
    const config = aliased.resources.pages[0].source.config

    assert.match(config.owner_id, /^gh-owner-/)
    assert.match(config.repo_id, /^gh-repo-/)
    assert.notEqual(config.owner_id, String(raw.resources.pages[0].source.config.owner_id))
    assert.notEqual(config.repo_id, String(raw.resources.pages[0].source.config.repo_id))
    assert.notEqual(config.owner, raw.resources.pages[0].source.config.owner)
    assert.notEqual(config.repo_name, raw.resources.pages[0].source.config.repo_name)
    assert.match(config.owner, /^ghowner-/)
    assert.match(config.repo_name, /^ghrepo-/)
  } finally {
    if (previousSalt === undefined) delete process.env.CF_ALIAS_SALT
    else process.env.CF_ALIAS_SALT = previousSalt
  }
})

test('replaces known repository names inside structured strings', () => {
  const previousSalt = process.env.CF_ALIAS_SALT
  process.env.CF_ALIAS_SALT = '22'.repeat(32)

  try {
    const raw = {
      account: { id: 'b'.repeat(32) },
      resources: {
        pages: [{
          name: 'sample-pages-project',
          source: {
            config: {
              owner: 'Sample-Owner',
              repo_name: 'sample-private-repository',
            },
          },
        }],
      },
      zones: [{
        dnsRecords: [{
          name: '_github-pages-challenge-sample-owner.example.test',
        }],
      }],
      auditLog: [{ resource: 'projects.domains:sample-private-repository' }],
    }
    const vault = { version: 1, saltFingerprint: null, entries: {} }

    const { aliased } = aliasSnapshot(raw, vault)

    assert.doesNotMatch(JSON.stringify(aliased), /sample-private-repository/)
    assert.doesNotMatch(JSON.stringify(aliased), /sample-owner/i)
    assert.match(aliased.auditLog[0].resource, /^projects\.domains:ghrepo-/)
    assert.match(aliased.zones[0].dnsRecords[0].name, /ghowner-/)
  } finally {
    if (previousSalt === undefined) delete process.env.CF_ALIAS_SALT
    else process.env.CF_ALIAS_SALT = previousSalt
  }
})
