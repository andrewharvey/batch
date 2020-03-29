'use strict';

const split = require('split');
const { pipeline } = require('stream');
const transform = require('parallel-transform');
const tb = require('@mapbox/tilebelt');
const AWS = require('aws-sdk');
const s3 = new AWS.S3({ region: process.env.AWS_DEFAULT_REGION });
const Q = require('d3-queue').queue;

const Err = require('./error');

const MAP_LAYERS = ['district.geojson'];

class Bin {
    static mvt() {
        return {
            token: process.env.MAPBOX_TOKEN
        };
    }

    static async tile(pool, z, x, y) {
        try {
            const bbox = tb.tileToBBOX([x, y, z]);

            const pgres = await pool.query(`
                SELECT
                    ST_AsMVT(q, 'data', 4096, 'geom') AS mvt
                FROM (
                    SELECT
                        id,
                        props,
                        ST_AsMVTGeom(geom, ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326), 4096, 256, false) AS geom
                    FROM
                        geo
                    WHERE
                        ST_Intersects(geom, ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326))
                ) q
            `, [
                bbox[0],
                bbox[1],
                bbox[2],
                bbox[3]
            ]);

            return pgres.rows[0].mvt;
        } catch (err) {
            return new Err(500, err, 'Failed to generate tile');
        }
    }

    static async populate(pool) {
        console.error('ok - populating map table');
        const q = new Q();

        for (const layer of MAP_LAYERS) {
            q.defer((layer, done) => {
                pipeline(
                    s3.getObject({
                        Bucket: 'v2.openaddresses.io',
                        Key: layer
                    }).createReadStream(),
                    split(),
                    transform(100, (feat, cb) => {
                        try {
                            feat = JSON.parse(feat);
                        } catch (err) {
                            return cb(err);
                        }

                        pool.query(`
                            INSERT INTO map (
                                name,
                                code,
                                geom
                            ) VALUES (
                                $1,
                                $2,
                                ST_SetSRID(ST_GeomFromGeoJSON($3), 4326)
                            );
                        `, [
                            feat.properties.name,
                            feat.properties.code,
                            JSON.stringify(feat.geometry)
                        ], (err) => {
                            if (err) return cb(err);
                            return cb();
                        });
                    }),
                    done
                );
            }, layer);
        }

        return new Promise((resolve, reject) => {
            q.awaitAll((err) => {
                if (err) return reject(err);

                console.error('ok - layers populated');
                return resolve(true);
            });
        });
    }
}

module.exports = Bin;