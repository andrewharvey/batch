#!/usr/bin/env node
'use strict';

const { interactive } = require('./lib/pre');

const OA = require('@openaddresses/lib');
const Meta = require('./lib/meta');
const os = require('os');
const pkg = require('./package.json');
const fs = require('fs');
const glob = require('glob');
const path = require('path');
const request = require('request');
const { pipeline } = require('stream/promises');
const unzipper = require('unzipper');

const args = require('minimist')(process.argv, {
    boolean: ['interactive'],
    alias: {
        interactive: 'i'
    }
});

if (require.main === module) {
    if (args.interactive) return prompt();
    return cli();
}

async function prompt() {
    await interactive([{
        type: 'text',
        message: 'OA BRANCH',
        name: 'OA_BRANCH',
        default: 'master'
    }]);

    return cli();
}

async function cli() {
    if (!process.env.OA_API) throw new Error('No OA_API env var defined');
    if (!process.env.OA_BRANCH) throw new Error('No OA_BRANCH env var defined');
    if (!process.env.SharedSecret) throw new Error('No SharedSecret env var defined');
    if (!process.env.StackName) process.env.StackName = 'local';
    if (!process.env.Bucket) process.env.Bucket = 'v2.openaddresses.io';

    const tmp = path.resolve(os.tmpdir(), Math.random().toString(36).substring(2, 15));
    console.error(`ok - ${tmp}`);
    fs.mkdirSync(tmp);

    const meta = new Meta();
    const oa = new OA({
        url: process.env.OA_API,
        secret: process.env.SharedSecret
    });

    try {
        await meta.load();
        await meta.protection(true);

        console.error('ok - fetching repo');
        await fetch(tmp);
        console.error('ok - extracted repo');

        console.error('ok - fetching latest sha');
        const sha = await get_sha();
        console.error(`ok - ${sha}`);

        console.error('ok - listing jobs');
        const jobs = list(tmp, sha);
        console.error(`ok - ${jobs.length} jobs found`);

        console.error('ok - creating run');
        const r = await oa.cmd('run', 'create', {
            live: true
        });
        console.error(`ok - run: ${r.id} created`);

        console.error('ok - populating run');
        await oa.cmd('run', 'create_jobs', {
            ':run': r.id,
            jobs
        });
        console.error('ok - run populated');

        await meta.protection(false);
    } catch (err) {
        console.error(err);
        await meta.protection(false);
        process.exit(1);
    }
}

async function fetch(tmp) {
    await pipeline(
        request(`https://github.com/openaddresses/openaddresses/archive/${process.env.OA_BRANCH}.zip`),
        fs.createWriteStream(path.resolve(tmp, 'openaddresses.zip'))
    );

    await pipeline(
        fs.createReadStream(path.resolve(tmp, 'openaddresses.zip')),
        unzipper.Extract({
            path: path.resolve(tmp, 'openaddresses')
        })
    );

    return true;
}

function list(tmp, sha) {
    const dir = fs.readdirSync(path.resolve(tmp, 'openaddresses'))[0];
    const globs = glob.sync('**/*.json', {
        nodir: true,
        cwd: path.resolve(tmp, 'openaddresses', dir, 'sources')
    });

    const jobs = [];
    for (const glob of globs) {
        const source = JSON.parse(fs.readFileSync(path.resolve(tmp, 'openaddresses', dir, 'sources', glob)));
        if (source.schema !== 2) continue;

        for (const layer of Object.keys(source.layers)) {
            for (const name of source.layers[layer]) {
                jobs.push({
                    source: `https://raw.githubusercontent.com/openaddresses/openaddresses/${sha}/sources/${glob}`,
                    layer: layer,
                    name: name.name
                });
            }
        }
    }

    return jobs;
}

async function get_sha() {
    return new Promise((resolve, reject) => {
        request({
            json: true,
            url: 'https://api.github.com/repos/openaddresses/openaddresses/commits/master',
            method: 'GET',
            headers: {
                'User-Agent': `OpenAddresses Task v${pkg.version}`
            }
        }, (err, res) => {
            if (err) return reject(err);
            if (res.statusCode !== 200 && res.body.message) return reject(new Error(res.body.message));
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: Failed to populate run`));
            return resolve(res.body.sha);
        });
    });
}
