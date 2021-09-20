

const Err = require('./error');
const { Status } = require('./util');
const batchjob = require('./batch').trigger;
const moment = require('moment');
const AWS = require('aws-sdk');
const S3 = require('./s3');
const cwl = new AWS.CloudWatchLogs({ region: process.env.AWS_DEFAULT_REGION });
const { sql } = require('slonik');

class Exporter {
    constructor() {
        this.id = false;
        this.uid = false;
        this.job_id = false;
        this.created = false;
        this.expiry = false;
        this.format = false;
        this.size = 0;
        this.status = false;
        this.loglink = false;

        // Attributes which are allowed to be patched
        this.attrs = Object.keys(require('../schema/req.body.PatchExport.json').properties);
    }

    json() {
        return {
            id: parseInt(this.id),
            uid: parseInt(this.uid),
            job_id: parseInt(this.job_id),
            format: this.format,
            created: this.created,
            expiry: this.expiry,
            size: parseInt(this.size),
            status: this.status,
            loglink: this.loglink
        };
    }

    /**
     * List & Filter Exports
     *
     * @param {Pool} pool - Postgres Pool instance
     * @param {Object} query - Query object
     * @param {Number} [query.limit=100] - Max number of results to return
     * @param {Number} [query.page=0] - Current offset to return
     * @param {String} [query.before=undefined] - Only show exports before the given date
     * @param {String} [query.after=undefined] - Only show exports after the given date
     * @param {Number} [query.status=["Success", "Fail", "Pending", "Warn"]] - Only show exports with a given status
     * @param {Number} query.uid - Only show exports for a given user
     */
    static async list(pool, query) {
        if (!query) query = {};
        if (!query.limit) query.limit = 100;
        if (!query.page) query.page = 0;
        if (!query.status) query.status = Status.list();

        if (!query.after) query.after = null;
        if (!query.before) query.before = null;
        if (!query.uid) query.uid = null;

        if (query.after) {
            try {
                query.after = moment(query.after);
            } catch (err) {
                throw new Err(400, null, 'after param is not recognized as a valid date');
            }
        }

        if (query.before) {
            try {
                query.before = moment(query.before);
            } catch (err) {
                throw new Err(400, null, 'before param is not recognized as a valid date');
            }
        }

        Status.verify(query.status);

        let pgres;
        try {
            pgres = await pool.query(sql`
                SELECT
                    count(*) OVER() AS count,
                    exports.id,
                    exports.job_id,
                    exports.uid,
                    exports.status,
                    exports.format,
                    exports.created,
                    exports.expiry,
                    exports.loglink,
                    exports.size,
                    job.source_name,
                    job.layer,
                    job.name
                FROM
                    exports
                        LEFT JOIN job
                            ON job.id = exports.job_id
                WHERE
                    ${sql.array(query.status, sql`TEXT[]`)} @> ARRAY[exports.status]
                    AND (${query.uid}::BIGINT IS NULL OR uid = ${query.uid})
                    AND (${query.after}::TIMESTAMP IS NULL OR exports.created > ${query.after ? query.after.toDate().toISOString() : null}::TIMESTAMP)
                    AND (${query.before}::TIMESTAMP IS NULL OR exports.created < ${query.before ? query.before.toDate().toISOString() : null}::TIMESTAMP)
                ORDER BY
                    exports.created DESC
                LIMIT
                    ${query.limit}
                OFFSET
                    ${query.page * query.limit}
            `);
        } catch (err) {
            throw new Err(500, err, 'failed to fetch runs');
        }

        return {
            total: pgres.rows.length ? parseInt(pgres.rows[0].count) : 0,
            exports: pgres.rows.map((exp) => {
                exp.id = parseInt(exp.id);
                exp.uid = parseInt(exp.uid);
                exp.job_id = parseInt(exp.job_id);

                delete exp.count;

                return exp;
            })
        };
    }

    /**
     * Count the number of exports the user has performed this monttw
     *
     * @param {Pool} pool Postgres Pool Instance
     * @param {Number} uid User ID to count
     */
    static async count(pool, uid) {
        try {
            const pgres = await pool.query(sql`
                SELECT
                    count(*)
                FROM
                    exports
                WHERE
                    uid = ${uid}
                    AND created > date_trunc('month', NOW())
            `);

            if (!pgres.rows.length) return 0;
            return parseInt(pgres.rows[0].count);
        } catch (err) {
            throw new Err(500, err, 'Failed to get export count');
        }
    }

    static async data(pool, auth, export_id, res) {
        const exp = await Exporter.from(pool, export_id);

        if (auth.access !== 'admin' && auth.uid !== exp.uid) throw new Err(401, null, 'Not Authorized to download');
        if (exp.status !== 'Success') throw new Err(400, null, 'Cannot download an unsuccessful export');

        const s3 = new S3({
            Bucket: process.env.Bucket,
            Key: `${process.env.StackName}/export/${export_id}/export.zip`
        });

        return s3.stream(res, `export-${export_id}.zip`);
    }

    /**
     * Return a single exort
     *
     * @param {Pool} pool Postgres Pool Instance
     * @param {Number} id Export ID
     */
    static async from(pool, id) {
        let pgres;
        try {
            pgres = await pool.query(sql`
                SELECT
                    *
                FROM
                    exports
                WHERE
                    id = ${id}
            `);
        } catch (err) {
            throw new Err(500, err, 'failed to fetch export');
        }

        const exp = new Exporter();

        if (!pgres.rows.length) {
            throw new Err(404, null, 'no exports by that id');
        }

        for (const key of Object.keys(pgres.rows[0])) {
            exp[key] = pgres.rows[0][key];
        }

        exp.id = parseInt(exp.id);
        exp.uid = parseInt(exp.uid);
        exp.job_id = parseInt(exp.job_id);
        if (exp.size) exp.size = parseInt(exp.size);

        return exp;
    }

    patch(patch) {
        for (const attr of this.attrs) {
            if (patch[attr] !== undefined) {
                this[attr] = patch[attr];
            }
        }
    }

    async commit(pool) {
        try {
            await pool.query(sql`
                UPDATE exports
                    SET
                        size = ${this.size},
                        status = ${this.status},
                        loglink = ${this.loglink}
                    WHERE
                        id = ${this.id}
           `);
        } catch (err) {
            throw new Err(500, err, 'failed to save export');
        }

        return this;

    }

    /**
     * Create a new Export
     *
     * @param {Pool} pool Postgres Pool Instance
     * @param {Object} params
     * @param {Number} params.uid User ID that created the export
     * @param {Number} params.job_id Job to export
     * @param {String} params.format Format to export to
     */
    static async generate(pool, params = {}) {
        let pgres;
        try {
            pgres = await pool.query(sql`
                INSERT INTO exports (
                    uid,
                    job_id,
                    format
                ) VALUES (
                    ${params.uid},
                    ${params.job_id},
                    ${params.format}
                ) RETURNING *
            `);
        } catch (err) {
            throw new Err(500, err, 'failed to generate exports');
        }

        const exp = new Exporter();

        pgres.rows[0].id = parseInt(pgres.rows[0].id);
        for (const key of Object.keys(pgres.rows[0])) {
            exp[key] = pgres.rows[0][key];
        }

        return exp;
    }

    /**
     * Submit the Export to AWS Batch for processing
     */
    async batch() {
        if (!this.id) throw new Err(400, null, 'Cannot batch an export without an ID');

        if (process.env.StackName === 'test') {
            return true;
        } else {
            try {
                return await batchjob({
                    type: 'export',
                    id: this.id,
                    job: this.job_id,
                    format: this.format
                });
            } catch (err) {
                throw new Err(500, err, 'failed to submit export to batch');
            }
        }
    }

    async log() {
        return new Promise((resolve, reject) => {
            if (!this.loglink) return reject(new Err(404, null, 'Export has not produced a log'));

            cwl.getLogEvents({
                logGroupName: '/aws/batch/job',
                logStreamName: this.loglink
            }, (err, res) => {
                if (err) return reject(new Err(500, err, 'Could not retrieve logs' ));

                let line = 0;
                return resolve(res.events.map((event) => {
                    return {
                        id: ++line,
                        timestamp: event.timestamp,
                        message: event.message
                    };
                }));
            });
        });
    }

}

module.exports = Exporter;
