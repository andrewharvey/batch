import fs from 'fs';
import path from 'path';
import Job from '../lib/job.js';
import test from 'tape';
import AWS from '@mapbox/mock-aws-sdk-js';
import stream from 'stream';

test('Job#compress', async (t) => {
    try {
        const job = new Job(true, 1);

        fs.writeFileSync(path.resolve(job.tmp, 'out.geojson'), 'test-string');

        t.ok(await job.compress());
    } catch (err) {
        t.error(err);
    }

    t.end();
});

test('Job#convert', async (t) => {
    try {
        const job = new Job(true, 1);
        job.source = 'fake-url';
        job.layer = 'addresses';
        job.name = 'state';

        fs.writeFileSync(
            path.resolve(job.tmp, 'out.csv'),
            fs.readFileSync(new URL('./fixtures/input.csv', import.meta.url))
        );

        const out = await job.convert();
        await job.validate();
        t.ok(out, 'output file');

        const file = String(fs.readFileSync(out)).split('\n').filter((row) => {
            return !!row.trim();
        }).map((row) => {
            return JSON.parse(row);
        });

        t.equals(file.length, 99, 'length');

        file.forEach((row) => {
            if (row.geometry.type !== 'Point') t.fail('Point');
        });

        t.equals(job.count, 99, 'job.count');
        t.deepEquals(job.bounds, {
            type: 'Polygon',
            coordinates: [[
                [-64.2400062, 45.9678856],
                [-62.053746, 45.9678856],
                [-62.053746, 46.8613679],
                [-64.2400062, 46.8613679],
                [-64.2400062, 45.9678856]
            ]]
        }, 'job.bounds');
        t.deepEquals(job.stats, {
            counts: {
                unit: 0,
                number: 99,
                street: 99,
                city: 99,
                district: 99,
                region: 0,
                postcode: 0
            },
            validity: {
                valid: 99,
                failures: {
                    geometry: 0,
                    number: 0,
                    street: 0
                }
            }
        }, 'job.stats');
    } catch (err) {
        t.error(err);
    }

    t.end();
});

test('Job#s3_down', async (t) => {
    try {
        const job = new Job(true, 1);

        job.source = 'http://example.com';
        job.layer = 'addresses';
        job.name = 'county';

        job.specific = JSON.parse(fs.readFileSync(new URL('./fixtures/us-or-clackamas.json', import.meta.url))).layers.addresses[0];

        AWS.stub('S3', 'getObject', async function(params) {
            t.deepEquals(params, {
                Bucket: 'data.openaddresses.io',
                Key: 'cache/us-or-clackamas.zip'
            });

            this.request.createReadStream.returns(new stream.Readable({
                read: function() {
                    this.push('123');
                    this.push(null);
                }
            }));
        });

        await job.s3_down();

        t.equals(job.specific.protocol, 'file', 'protocol: file');
        t.ok(job.specific.data.match(/file:\/\//), 'data: <file://> prefix');
    } catch (err) {
        t.error(err);
    }

    AWS.S3.restore();

    t.end();
});
