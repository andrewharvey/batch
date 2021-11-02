const fs = require('fs');
const jwt = require('jsonwebtoken');
const Cacher = require('./lib/cacher');
const Analytics = require('./lib/analytics');
const path = require('path');
const morgan = require('morgan');
const express = require('express');
const pkg = require('./package.json');
const minify = require('express-minify');
const bodyparser = require('body-parser');
const TileBase = require('tilebase');
const { Schema, Err } = require('@openaddresses/batch-schema');
const { sql, createPool } = require('slonik');
const args = require('minimist')(process.argv, {
    boolean: ['help', 'populate', 'email', 'no-cache', 'no-tilebase'],
    alias: {
        no_tb: 'no-tilebase',
        no_c: 'no-cache'
    },
    string: ['postgres']
});

const Config = require('./lib/config');
const SiteMap = require('./lib/sitemap');

if (require.main === module) {
    configure(args);
}

async function configure(args, cb) {
    try {
        return server(args, await Config.env(args), cb);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

/**
 * @apiDefine admin Admin
 *   The user must be an admin to use this endpoint
 */
/**
 * @apiDefine upload Upload
 *   The user must be an admin or have the "upload" flag enabled on their account
 */
/**
 * @apiDefine user User
 *   A user must be logged in to use this endpoint
 */
/**
 * @apiDefine public Public
 *   This API endpoint does not require authentication
 */

async function server(args, config, cb) {
<<<<<<< HEAD
    // these must be run after lib/config
    const Map = require('./lib/map');
    const ci = new (require('./lib/ci'))(config);
    const Err = require('./lib/error');
    const Run = require('./lib/run');
    const Job = require('./lib/job');
    const JobError = require('./lib/joberror');
    const Upload = require('./lib/upload');
    const Schedule = require('./lib/schedule');
    const Collection = require('./lib/collections');
    const Exporter = require('./lib/exporter');

    console.log(`ok - loading: s3://${config.Bucket}/${config.StackName}/fabric.tilebase`);
    const tb = new TileBase(`s3://${config.Bucket}/${config.StackName}/fabric.tilebase`);
    console.log('ok - loaded TileBase');
    await tb.open();
=======
    let tb = false;
    if (!args['no-tilebase']) {
        console.log(`ok - loading: s3://${config.Bucket}/${config.StackName}/fabric.tilebase`);
        tb = new TileBase(`s3://${config.Bucket}/${config.StackName}/fabric.tilebase`);
        console.log('ok - loaded TileBase');
        await tb.open();
    } else {
        console.log('ok - TileBase Disabled');
    }
>>>>>>> 4216367e2bbdb933128338555dfb05ca0b7ceacd

    let postgres = process.env.POSTGRES;

    if (args.postgres) {
        postgres = args.postgres;
    } else if (!postgres) {
        postgres = 'postgres://postgres@localhost:5432/openaddresses';
    }

    let pool = false;
    let retry = 5;
    do {
        try {
            pool = createPool(postgres);

            await pool.query(sql`SELECT NOW()`);
        } catch (err) {
            pool = false;

            if (retry === 0) {
                console.error('not ok - terminating due to lack of postgres connection');
                return process.exit(1);
            }

            retry--;
            console.error('not ok - unable to get postgres connection');
            console.error(`ok - retrying... (${5 - retry}/5)`);
            await sleep(5000);
        }
    } while (!pool);

    const analytics = new Analytics(pool);

    config.cacher = new Cacher(args['no-cache']);
    config.pool = pool;
    config.tb = tb;

    try {
        if (args.populate) {
            await Map.populate(pool);
        }
    } catch (err) {
        throw new Error(err);
    }

    const user = new (require('./lib/user'))(pool);
    const token = new (require('./lib/token'))(pool);

    const app = express();

    const schema = new Schema(express.Router(), {
        schemas: path.resolve(__dirname, './schema')
    });

    app.disable('x-powered-by');
    app.use(minify());

    app.use(analytics.middleware());
    app.use(express.static('web/dist'));

    /**
     * @api {get} /api Get Metadata
     * @apiVersion 1.0.0
     * @apiName Meta
     * @apiGroup Server
     * @apiPermission public
     *
     * @apiDescription
     *     Return basic metadata about server configuration
     *
     * @apiSchema {jsonschema=./schema/res.Meta.json} apiSuccess
     */
    app.get('/api', (req, res) => {
        return res.json({
            version: pkg.version
        });
    });

    app.get('/sitemap.xml', async (req, res) => {
        try {
            res.type('application/xml');

            const list = await config.cacher.get(Miss(req.query, 'sitemap'), async () => {
                return await SiteMap.list(config.pool);
            });

            res.send(list);
        } catch (err) {
            Err.respond(res, err);
        }
    });

    /**
     * @api {get} /health Server Healthcheck
     * @apiVersion 1.0.0
     * @apiName Health
     * @apiGroup Server
     * @apiPermission public
     *
     * @apiDescription
     *     AWS ELB Healthcheck for the server
     *
     * @apiSchema {jsonschema=./schema/res.Health.json} apiSuccess
     */
    app.get('/health', (req, res) => {
        return res.json({
            healthy: true,
            message: 'I work all day, I work all night to get the open the data!'
        });
    });

    app.use('/api', schema.router);
    app.use('/docs', express.static('./doc'));
    app.use('/*', express.static('web/dist'));

    schema.router.use(bodyparser.urlencoded({ extended: true }));
    schema.router.use(morgan('combined'));
    schema.router.use(bodyparser.json({
        limit: '50mb'
    }));

    // Unified Auth
    schema.router.use(async (req, res, next) => {
        if (req.header('shared-secret')) {
            if (req.header('shared-secret') !== config.SharedSecret) {
                return res.status(401).json({
                    status: 401,
                    message: 'Invalid shared secret'
                });
            } else {
                req.auth = {
                    uid: false,
                    type: 'secret',
                    level: 'sponsor',
                    username: false,
                    access: 'admin',
                    email: false,
                    flags: {}
                };
            }
        } else if (req.header('authorization')) {
            const authorization = req.header('authorization').split(' ');
            if (authorization[0].toLowerCase() !== 'bearer') {
                return res.status(401).json({
                    status: 401,
                    message: 'Only "Bearer" authorization header is allowed'
                });
            }

            if (authorization[1].split('.')[0] === 'oa') {
                try {
                    req.auth = await token.validate(authorization[1]);
                    req.auth.type = 'token';
                } catch (err) {
                    return Err.respond(err, res);
                }
            } else {
                try {
                    const decoded = jwt.verify(authorization[1], config.SharedSecret);
                    req.auth = await user.user(decoded.u);
                    req.auth.type = 'session';
                } catch (err) {
                    return res.status(401).json({
                        status: 401,
                        message: err.message
                    });
                }
            }
        } else if (req.query.token) {
            try {
                const decoded = jwt.verify(req.query.token, config.SharedSecret);
                req.token = await user.user(decoded.u);
                req.token.type = 'token';
            } catch (err) {
                // Login/Verify uses non-jwt token
            }
        } else {
            req.auth = false;
        }

        return next();
    });


    await schema.api();
    // Load dynamic routes directory
    for (const r of fs.readdirSync(path.resolve(__dirname, './routes'))) {
        if (!config.silent) console.error(`ok - loaded routes/${r}`);
        await require('./routes/' + r)(schema, config);
    }

    schema.router.all('*', (req, res) => {
        return res.status(404).json({
            status: 404,
            message: 'API endpoint does not exist!'
        });
    });

    schema.error();

    const srv = app.listen(4999, (err) => {
        if (err) return err;

        if (cb) return cb(srv, config);

        console.log('ok - http://localhost:4999');
    });
}

<<<<<<< HEAD
    /**
     * @api {get} /api/collections List Collections
     * @apiVersion 1.0.0
     * @apiName ListCollections
     * @apiGroup Collections
     * @apiPermission public
     *
     * @apiDescription
     *     Return a list of all collections and their glob rules
     *
     * @apiSchema {jsonawait schema=./schema/res.ListCollections.json} apiSuccess
     */
    await schema.get( '/collections', {
        res: 'res.ListCollections.json'
    }, async (req, res) => {
        try {
            const collections = await config.cacher.get(Miss(req.query, 'collection'), async () => {
                return await Collection.list(pool);
            });

            return res.json(collections);
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {get} /api/collections/:collection/data Get Collection Data
     * @apiVersion 1.0.0
     * @apiName DataCollection
     * @apiGroup Collections
     * @apiPermission user
     *
     * @apiDescription
     *   Download a given collection file
     *
     *    Note: the user must be authenticated to perform a download. One of our largest costs is
     *    S3 egress, authenticated downloads allow us to prevent abuse, keep the project running and the data free.
     *
     *    Faster Downloads? Have AWS? The Jobs, Data, & Collections API all return an `s3` property which links
     *    to a requester pays object on S3. For those that are able, this is the best way to download data.
     *
     *    OpenAddresses is entirely funded by volunteers (many of them the developers themselves!)
     *    Please consider donating if you are able https://opencollective.com/openaddresses
     *
     * @apiParam {Number} :collection Collection ID
     */
    await schema.get( '/collections/:collection/data', null,
        async (req, res) => {
            try {
                await Param.int(req, 'collection');

                await user.is_auth(req);

                Collection.data(pool, req.params.collection, res);
            } catch (err) {
                return Err.respond(err, res);
            }
        });

    /**
     * @api {delete} /api/collections/:collection Delete Collection
     * @apiVersion 1.0.0
     * @apiName DeleteCollection
     * @apiGroup Collections
     * @apiPermission admin
     *
     * @apiDescription
     *   Delete a collection (This should not be done lightly)
     *
     * @apiParam {Number} :collection Collection ID
     *
     * @apiSchema {jsonawait schema=./schema/res.Standard.json} apiSuccess
     */
    await schema.delete( '/collections/:collection', {
        res: 'res.Standard.json'
    }, async (req, res) => {
        try {
            await Param.int(req, 'collection');

            await user.is_admin(req);

            await Collection.delete(pool, req.params.collection);

            return res.json({
                status: 200,
                message: 'Collection Deleted'
            });
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {post} /api/collections Create Collection
     * @apiVersion 1.0.0
     * @apiName CreateCollection
     * @apiGroup Collections
     * @apiPermission admin
     *
     * @apiDescription
     *   Create a new collection
     *
     * @apiSchema (Body) {jsonawait schema=./schema/req.body.CreateCollection.json} apiParam
     * @apiSchema {jsonawait schema=./schema/res.Collection.json} apiSuccess
     */
    await schema.post( '/collections', {
        body: 'req.body.CreateCollection.json',
        res: 'res.Collection.json'
    }, async (req, res) => {
        try {
            await user.is_admin(req);

            const collection = new Collection(req.body.name, req.body.sources);
            await collection.generate(pool);

            await config.cacher.del('collection');
            return res.json(collection.json());
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {patch} /api/collections/:collection Patch Collection
     * @apiVersion 1.0.0
     * @apiName PatchCollection
     * @apiGroup Collections
     * @apiPermission admin
     *
     * @apiDescription
     *   Update a collection
     *
     * @apiParam {Number} :collection Collection ID
     *
     * @apiSchema (Body) {jsonawait schema=./schema/req.body.PatchCollection.json} apiParam
     * @apiSchema {jsonawait schema=./schema/res.Collection.json} apiSuccess
     */
    await schema.patch( '/collections/:collection', {
        body: 'req.body.PatchCollection.json',
        res: 'res.Collection.json'
    }, async (req, res) => {
        try {
            await Param.int(req, 'collection');

            await user.is_admin(req);

            const collection = await Collection.from(pool, req.params.collection);

            collection.patch(req.body);

            await collection.commit(pool);
            await config.cacher.del('collection');

            return res.json(collection.json());
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {get} /api/run List Runs
     * @apiVersion 1.0.0
     * @apiName ListRuns
     * @apiGroup Run
     * @apiPermission public
     *
     * @apiDescription
     *   Runs are container objects that contain jobs that were started at the same time or by the same process
     *
     * @apiParam {Number} :data Data ID
     *
     * @apiSchema (Query) {jsonawait schema=./schema/req.query.ListRuns.json} apiParam
     * @apiSchema {jsonawait schema=./schema/res.ListRuns.json} apiSuccess
     */
    await schema.get( '/run', {
        query: 'req.query.ListRuns.json',
        res: 'res.ListRuns.json'
    }, async (req, res) => {
        try {
            if (req.query.status) req.query.status = req.query.status.split(',');
            const runs = await Run.list(pool, req.query);

            return res.json(runs);
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {post} /api/run Create Run
     * @apiVersion 1.0.0
     * @apiName CreateRun
     * @apiGroup Run
     * @apiPermission admin
     *
     * @apiDescription
     *   Create a new run to hold a batch of jobs
     *
     * @apiSchema (Body) {jsonawait schema=./schema/req.body.CreateRun.json} apiParam
     * @apiSchema {jsonawait schema=./schema/res.Run.json} apiSuccess
     */
    await schema.post( '/run', {
        body: 'req.body.CreateRun.json',
        res: 'res.Run.json'
    }, async (req, res) => {
        try {
            await user.is_admin(req);

            const run = await Run.generate(pool, req.body);

            return res.json(run.json());
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {get} /api/run/:run Get Run
     * @apiVersion 1.0.0
     * @apiName Single
     * @apiGroup Run
     * @apiPermission public
     *
     * @apiParam {Number} :run Run ID
     *
     * @apiSchema {jsonawait schema=./schema/res.Run.json} apiSuccess
     */
    await schema.get( '/run/:run', {
        res: 'res.Run.json'
    }, async (req, res) => {
        try {
            await Param.int(req, 'run');

            res.json(await Run.from(pool, req.params.run));
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {get} /api/run/:run/count Run Stats
     * @apiVersion 1.0.0
     * @apiName RunStats
     * @apiGroup Run
     * @apiPermission public
     *
     * @apiDescription
     *     Return statistics about jobs within a given run
     *
     * @apiParam {Number} :run Run ID
     *
     * @apiSchema {jsonawait schema=./schema/res.RunStats.json} apiSuccess
     */
    await schema.get( '/run/:run/count', {
        res: 'res.RunStats.json'
    }, async (req, res) => {
        try {
            await Param.int(req, 'run');

            res.json(await Run.stats(pool, req.params.run));
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {patch} /api/run/:run Update Run
     * @apiVersion 1.0.0
     * @apiName Update
     * @apiGroup Run
     * @apiPermission public
     *
     * @apiDescription
     *   Update an existing run
     *
     * @apiParam {Number} :run Run ID
     *
     * @apiSchema (Body) {jsonawait schema=./schema/req.body.PatchRun.json} apiParam
     * @apiSchema {jsonawait schema=./schema/res.Run.json} apiSuccess
     *
     */
    await schema.patch( '/run/:run', {
        body: 'req.body.PatchRun.json',
        res: 'res.Run.json'
    }, async (req, res) => {
        try {
            await Param.int(req, 'run');

            await user.is_admin(req);

            const run = await Run.from(pool, req.params.run);

            // The CI is making a CI run "live" and updating the /data list
            if ((!run.live && req.body.live) || (run.live && !req.body.live)) await config.cacher.del('data');

            run.patch(req.body);

            await run.commit(pool);

            return res.json(run.json());
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {post} /api/run/:run/jobs Populate Run Jobs
     * @apiVersion 1.0.0
     * @apiName SingleJobsCreate
     * @apiGroup Run
     * @apiPermission admin
     *
     * @apiDescription
     *     Given an array sources, explode it into multiple jobs and submit to batch
     *     or pass in a predefined list of sources/layer/names
     *
     *     Note: once jobs are attached to a run, the run is "closed" and subsequent
     *     jobs cannot be attached to it
     *
     * @apiParam {Number} :run Run ID
     *
     * @apiSchema (Body) {jsonawait schema=./schema/req.body.SingleJobsCreate.json} apiParam
     * @apiSchema {jsonawait schema=./schema/res.SingleJobsCreate.json} apiSuccess
     */
    await schema.post( '/run/:run/jobs', {
        body: 'req.body.SingleJobsCreate.json',
        res: 'res.SingleJobsCreate.json'
    }, async (req, res) => {
        try {
            await Param.int(req, 'run');

            await user.is_admin(req);

            return res.json(await Run.populate(pool, req.params.run, req.body.jobs));
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {get} /api/run/:run/jobs List Run Jobs
     * @apiVersion 1.0.0
     * @apiName SingleJobs
     * @apiGroup Run
     * @apiPermission public
     *
     * @apiDescription
     *     Return all jobs for a given run
     *
     * @apiParam {Number} :run Run ID
     *
     * @apiSchema {jsonawait schema=./schema/res.SingleJobs.json} apiSuccess
     */
    await schema.get( '/run/:run/jobs', {
        res: 'res.SingleJobs.json'
    }, async (req, res) => {
        try {
            await Param.int(req, 'run');

            const jobs = await Run.jobs(pool, req.params.run);

            res.json({
                run: req.params.run,
                jobs: jobs
            });
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {get} /api/job List Jobs
     * @apiVersion 1.0.0
     * @apiName ListJobs
     * @apiGroup Job
     * @apiPermission public
     *
     * @apiDescription
     *     Return information about a given subset of jobs
     *
     * @apiSchema (query) {jsonawait schema=./schema/req.query.ListJobs.json} apiParam
     * @apiSchema {jsonawait schema=./schema/res.ListJobs.json} apiSuccess
     */
    await schema.get( '/job', {
        query: 'req.query.ListJobs.json',
        res: 'res.ListJobs.json'
    }, async (req, res) => {
        try {
            if (req.query.status) req.query.status = req.query.status.split(',');
            return res.json(await Job.list(pool, req.query));
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {get} /api/job/error Get Job Errors
     * @apiVersion 1.0.0
     * @apiName ErrorList
     * @apiGroup JobErrors
     * @apiPermission public
     *
     * @apiDescription
     *     All jobs that fail as part of a live run are entered into the JobError API
     *     This API powers a page that allows for human review of failing jobs
     *     Note: Job Errors are cleared with every subsequent full cache
     *
     * @apiSchema {jsonawait schema=./schema/res.ErrorList.json} apiSuccess
     */
    await schema.get( '/job/error', {
        res: 'res.ErrorList.json'
    }, async (req, res) => {
        try {
            return res.json(await JobError.list(pool, req.query));
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {get} /api/job/error/count Job Error Count

     * @apiVersion 1.0.0
     * @apiName ErrorCount
     * @apiGroup JobError
     * @apiPermission public
     *
     * @apiDescription
     *     Return a simple count of the current number of job errors
     *
     * @apiSchema {jsonawait schema=./schema/res.ErrorCount.json} apiSuccess
     */
    await schema.get( '/job/error/count', {
        res: 'res.ErrorCount.json'
    }, async (req, res) => {
        try {
            return res.json(await JobError.count(pool));
        } catch (err) {
            return Err.respond(err, res);
        }
    });


    /**
     * @api {get} /api/job/error/:job Get Job Error
     * @apiVersion 1.0.0
     * @apiName ErrorList
     * @apiGroup ErrorSingle
     * @apiPermission public
     *
     * @apiDescription
     *   Return a single job error if one exists or 404 if not
     *
     * @apiSchema {jsonawait schema=./schema/res.ErrorSingle.json} apiSuccess
     */
    await schema.get( '/job/error/:job', {
        res: 'res.ErrorSingle.json'
    }, async (req, res) => {
        try {
            await Param.int(req, 'job');

            return res.json(await JobError.get(pool, req.params.job));
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {post} /api/job/error Create Job Error
     * @apiVersion 1.0.0
     * @apiName ErrorCreate
     * @apiGroup JobError
     * @apiPermission admin
     *
     * @apiDescription
     *     Create a new Job Error in response to a live job that Failed or Warned
     *
     * @apiParam {Number} job Job ID of the given error
     * @apiParam {String} message Text representation of the error
     *
     * @apiSchema (Body) {jsonawait schema=./schema/req.body.ErrorCreate.json} apiParam
     * @apiSchema {jsonawait schema=./schema/res.ErrorCreate.json} apiSuccess
     */
    await schema.post( '/job/error', {
        body: 'req.body.ErrorCreate.json',
        res: 'res.ErrorCreate.json'
    }, async (req, res) => {
        try {
            await user.is_admin(req);

            const joberror = new JobError(req.body.job, req.body.message);
            return res.json(await joberror.generate(pool));
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {post} /api/job/error/:job Resolve Job Error
     * @apiVersion 1.0.0
     * @apiName ErrorModerate
     * @apiGroup JobError
     * @apiPermission admin
     *
     * @apiDescription
     *     Mark a job error as resolved
     *
     * @apiParam {Number} :job Job ID
     *
     * @apiSchema (Body) {jsonawait schema=./schema/res.ErrorModerate.json} apiParam
     * @apiSchema {jsonawait schema=./schema/res.ErrorModerate.json} apiSuccess
     */
    await schema.post( '/job/error/:job', {
        body: 'req.body.ErrorModerate.json',
        res: 'res.ErrorModerate.json'
    }, async (req, res) => {
        try {
            await Param.int(req, 'job');

            await user.is_flag(req, 'moderator');

            res.json(JobError.moderate(pool, ci, req.params.job, req.body));
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {get} /api/job/:job Get Job
     * @apiVersion 1.0.0
     * @apiName Single
     * @apiGroup Job
     * @apiPermission public
     *
     * @apiDescription
     *     Return all information about a given job
     *
     * @apiParam {Number} :job Job ID
     *
     * @apiSchema {jsonawait schema=./schema/res.Job.json} apiSuccess
     */
    await schema.get( '/job/:job', {
        res: 'res.Job.json'
    }, async (req, res) => {
        try {
            await Param.int(req, 'job');

            const job = await Job.from(pool, req.params.job);

            return res.json(job.json());
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {get} /api/job/:job/raw Raw Source
     * @apiVersion 1.0.0
     * @apiName RawSingle
     * @apiGroup Job
     * @apiPermission public
     *
     * @apiDescription
     *     Return the raw source from github - this API is not stable nor
     *     will it always return a consistent result
     *
     * @apiParam {Number} :job Job ID
     */
    await schema.get( '/job/:job/raw', null,
        async (req, res) => {
            try {
                await Param.int(req, 'job');

                const job = await Job.from(pool, req.params.job);

                console.error(job.source);
                return res.json(await job.get_raw());
            } catch (err) {
                return Err.respond(err, res);
            }
        });

    /**
     * @api {post} /api/job/:job Rerun Job
     * @apiVersion 1.0.0
     * @apiName JobRerun
     * @apiGroup Job
     * @apiPermission admin
     *
     * @apiDescription
     *     Submit a job for reprocessing - often useful for network errors
     *
     * @apiParam {Number} :job Job ID
     *
     * @apiSchema {jsonawait schema=./schema/res.SingleJobsCreate.json} apiSuccess
     */
    await schema.post( '/job/:job/rerun', {
        res: 'res.SingleJobsCreate.json'
    }, async (req, res) => {
        try {
            await Param.int(req, 'job');

            await user.is_admin(req);

            const job = await Job.from(pool, req.params.job);
            const run = await Run.from(pool, job.run);

            const new_run = await Run.generate(pool, {
                live: !!run.live
            });

            return res.json(await Run.populate(pool, new_run.id, [{
                source: job.source,
                layer: job.layer,
                name: job.name
            }]));
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {get} /api/job/:job/delta Job Stats Comparison
     * @apiVersion 1.0.0
     * @apiName SingleDelta
     * @apiGroup Job
     * @apiPermission public
     *
     * @apiDescription
     *   Compare the stats of the given job against the current live data job
     *
     * @apiParam {Number} :job Job ID
     *
     * @apiSchema {jsonawait schema=./schema/res.SingleDelta.json} apiSuccess
     */
    await schema.get( '/job/:job/delta', {
        res: 'res.SingleDelta.json'
    }, async (req, res) => {
        try {
            await Param.int(req, 'job');

            const delta = await Job.delta(pool, req.params.job);

            return res.json(delta);
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {get} /api/job/:job/output/source.png Get Job Preview
     * @apiVersion 1.0.0
     * @apiName SingleOutputPreview
     * @apiGroup Job
     * @apiPermission public
     *
     * @apiDescription
     *   Return the preview image for a given job
     *
     * @apiParam {Number} :job Job ID
     */
    await schema.get( '/job/:job/output/source.png', null,
        async (req, res) => {
            try {
                await Param.int(req, 'job');
                Job.preview(req.params.job, res);
            } catch (err) {
                return Err.respond(err, res);
            }
        });

    /**
     * @api {get} /api/job/:job/output/source.geojson.gz Get Job Data
     * @apiVersion 1.0.0
     * @apiName SingleOutputData
     * @apiGroup Job
     * @apiPermission public
     *
     * @apiDescription
     *    Note: the user must be authenticated to perform a download. One of our largest costs is
     *    S3 egress, authenticated downloads allow us to prevent abuse and keep the project running and the data freetw
     *
     *    Faster Downloads? Have AWS? The Jobs, Data, & Collections API all return an `s3` property which links
     *    to a requester pays object on S3. For those that are able, this is the best way to download data.
     *
     *    OpenAddresses is entirely funded by volunteers (many of then the developers themselves!)
     *    Please consider donating if you are able https://opencollective.com/openaddresses
     *
     * @apiParam {Number} :job Job ID
     */
    await schema.get( '/job/:job/output/source.geojson.gz', null,
        async (req, res) => {
            try {
                await Param.int(req, 'job');

                await user.is_auth(req);

                await Job.data(pool, req.params.job, res);
            } catch (err) {
                return Err.respond(err, res);
            }
        });

    /**
     * @api {get} /api/job/:job/output/sample Small Sample
     * @apiVersion 1.0.0
     * @apiName SampleData
     * @apiGroup Job
     * @apiPermission public
     *
     * @apiDescription
     *   Return an Array containing a sample of the properties
     *
     * @apiParam {Number} :job Job ID
     */
    await schema.get( '/job/:job/output/sample', null,
        async (req, res) => {
            try {
                await Param.int(req, 'job');

                return res.json(await Job.sample(pool, req.params.job));
            } catch (err) {
                return Err.respond(err, res);
            }
        });

    /**
     * @api {get} /api/job/:job/output/cache.zip Get Job Cache
     * @apiVersion 1.0.0
     * @apiName SingleOutputCache
     * @apiGroup Job
     * @apiPermission public
     *
     *  @apiDescription
     *    Note: the user must be authenticated to perform a download. One of our largest costs is
     *    S3 egress, authenticated downloads allow us to prevent abuse and keep the project running and the data freetw
     *
     *    Faster Downloads? Have AWS? The Jobs, Data, & Collections API all return an `s3` property which links
     *    to a requester pays object on S3. For those that are able, this is the best way to download data.
     *
     *    OpenAddresses is entirely funded by volunteers (many of then the developers themselves!)
     *    Please consider donating if you are able https://opencollective.com/openaddresses
     *
     * @apiParam {Number} :job Job ID
     *
     */
    await schema.get( '/job/:job/output/cache.zip', null,
        async (req, res) => {
            try {
                await Param.int(req, 'job');

                await user.is_auth(req);

                Job.cache(req.params.job, res);
            } catch (err) {
                return Err.respond(err, res);
            }
        });

    /**
     * @api {get} /api/job/:job/log Get Job Log
     * @apiVersion 1.0.0
     * @apiName SingleLog
     * @apiGroup Job
     * @apiPermission public
     *
     * @apiDescription
     *   Return the batch-machine processing log for a given job
     *   Note: These are stored in AWS CloudWatch and *do* expire
     *   The presence of a loglink on a job, does not guarentree log retention
     *
     * @apiParam {Number} :job Job ID
     *
     * @apiSchema {jsonawait schema=./schema/res.SingleLog.json} apiSuccess
     */
    await schema.get( '/job/:job/log', {
        res: 'res.SingleLog.json'
    }, async (req, res) => {
        try {
            await Param.int(req, 'job');

            const job = await Job.from(pool, req.params.job);

            return res.json(await job.log());
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {patch} /api/job/:job Update Job
     * @apiVersion 1.0.0
     * @apiName JobPatch
     * @apiGroup Job
     * @apiPermission admin
     *
     * @apiDescription
     *   Update a job
     *
     * @apiParam {Number} :job Job ID
     *
     * @apiSchema (Body) {jsonawait schema=./schema/req.body.PatchJob.json} apiParam
     * @apiSchema {jsonawait schema=./schema/res.Job.json} apiSuccess
     */
    await schema.patch( '/job/:job', {
        body: 'req.body.PatchJob.json',
        res: 'res.Job.json'
    }, async (req, res) => {
        try {
            await Param.int(req, 'job');

            await user.is_admin(req);

            const job = await Job.from(pool, req.params.job);
            job.patch(req.body);
            await job.commit(pool, Run, Data, ci);

            await Run.ping(pool, ci, job);

            return res.json(job.json());
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {get} /api/dash/traffic Session Counts
     * @apiVersion 1.0.0
     * @apiName TrafficAnalytics
     * @apiGroup Analytics
     * @apiPermission admin
     *
     * @apiDescription
     *   Report anonymized traffic data about the number of user sessions created in a given day.
     *
     * @apiSchema {jsonawait schema=./schema/res.TrafficAnalytics.json} apiSuccess
     */
    await schema.get( '/dash/traffic', {
        res: 'res.TrafficAnalytics.json'
    }, async (req, res) => {
        try {
            await user.is_admin(req);

            res.json(await analytics.traffic());
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {get} /api/dash/collections Collection Counts
     * @apiVersion 1.0.0
     * @apiName CollectionsAnalytics
     * @apiGroup Analytics
     * @apiPermission admin
     *
     * @apiDescription
     *   Report anonymized traffic data about the number of collection downloads.
     *
     * @apiSchema {jsonawait schema=./schema/res.CollectionsAnalytics.json} apiSuccess
     */
    await schema.get( '/dash/collections', {
        res: 'res.CollectionsAnalytics.json'
    }, async (req, res) => {
        try {
            await user.is_admin(req);

            res.json(await analytics.collections());
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {post} /api/export Create Export
     * @apiVersion 1.0.0
     * @apiName CreateExport
     * @apiGroup Exports
     * @apiPermission user
     *
     * @apiDescription
     *   Create a new export task
     *
     * @apiSchema (Body) {jsonawait schema=./schema/req.body.CreateExport.json} apiParam
     * @apiSchema {jsonawait schema=./schema/res.Export.json} apiSuccess
     */
    await schema.post( '/export', {
        body: 'req.body.CreateExport.json',
        res: 'res.Export.json'
    }, async (req, res) => {
        try {
            await user.is_level(req, 'backer');

            if (req.auth.access !== 'admin' && await Exporter.count(pool, req.auth.uid) >= config.limits.exports) {
                throw new Err(400, null, 'Reached Monthly Export Limit');
            }

            const job = await Job.from(pool, req.body.job_id);
            if (job.status !== 'Success') throw new Err(400, null, 'Cannot export a job that was not successful');

            req.body.uid = req.auth.uid;

            const exp = await Exporter.generate(pool, req.body);
            await exp.batch();
            return res.json(exp.json());
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {get} /api/export/:exportid/log Get Export Log
     * @apiVersion 1.0.0
     * @apiName ExportSingleLog
     * @apiGroup Export
     * @apiPermission user
     *
     * @apiDescription
     *   Return the batch-machine processing log for a given export
     *   Note: These are stored in AWS CloudWatch and *do* expire
     *   The presence of a loglink on a export does not guarantee log retention
     *
     * @apiParam {Number} :exportid Export ID
     *
     * @apiSchema {jsonawait schema=./schema/res.SingleLog.json} apiSuccess
     */
    await schema.get( '/export/:exportid/log', {
        res: 'res.SingleLog.json'
    }, async (req, res) => {
        try {
            await Param.int(req, 'exportid');

            const exp = await Exporter.from(pool, req.params.exportid);
            if (req.auth.access !== 'admin' && req.auth.uid !== exp.json().uid) throw new Err(401, null, 'You didn\'t create that export');

            return res.json(await exp.log());
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {get} /api/export List Export
     * @apiVersion 1.0.0
     * @apiName ListExport
     * @apiGroup Exports
     * @apiPermission user
     *
     * @apiDescription
     *   List existing exports
     *
     * @apiSchema (Query) {jsonawait schema=./schema/req.query.ListExport.json} apiParam
     * @apiSchema {jsonawait schema=./schema/res.ListExport.json} apiSuccess
     */
    await schema.get( '/export', {
        query: 'req.query.ListExport.json',
        res: 'res.ListExport.json'
    }, async (req, res) => {
        try {
            if (req.auth.access !== 'admin') {
                req.query.uid = req.auth.uid;
            }

            res.json(await Exporter.list(pool, req.query));
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {get} /api/export/:export Get Export
     * @apiVersion 1.0.0
     * @apiName GetExport
     * @apiGroup Exports
     * @apiPermission user
     *
     * @apiDescription
     *   Get a single export
     *
     * @apiSchema {jsonawait schema=./schema/res.Export.json} apiSuccess
     */
    await schema.get( '/export/:exportid', {
        res: 'res.Export.json'
    }, async (req, res) => {
        try {
            await Param.int(req, 'exportid');

            const exp = (await Exporter.from(pool, req.params.exportid)).json();
            if (req.auth.access !== 'admin' && req.auth.uid !== exp.uid) throw new Err(401, null, 'You didn\'t create that export');

            res.json(exp);
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {get} /api/export/:exportid/output/export.zip Get Export Data
     * @apiVersion 1.0.0
     * @apiName DataExport
     * @apiGroup Exports
     * @apiPermission user
     *
     * @apiDescription
     *   Download the data created in an export
     *
     * @apiParam {Number} :exportid Export ID
     */
    await schema.get( '/export/:exportid/output/export.zip', null,
        async (req, res) => {
            try {
                await Param.int(req, 'exportid');
                await user.is_auth(req);

                await Exporter.data(pool, req.auth, req.params.exportid, res);
            } catch (err) {
                return Err.respond(err, res);
            }
        });

    /**
     * @api {patch} /api/export/:export Patch Export
     * @apiVersion 1.0.0
     * @apiName PatchExport
     * @apiGroup Exports
     * @apiPermission admin
     *
     * @apiDescription
     *   Update a single export
     *
     * @apiSchema (Body) {jsonawait schema=./schema/req.body.PatchExport.json} apiParam
     * @apiSchema {jsonawait schema=./schema/res.Export.json} apiSuccess
     */
    await schema.patch( '/export/:exportid', {
        body: 'req.body.PatchExport.json',
        res: 'res.Export.json'
    }, async (req, res) => {
        try {
            await Param.int(req, 'exportid');
            await user.is_admin(req);

            const exp = await Exporter.from(pool, req.params.exportid);
            exp.patch(req.body);
            await exp.commit(pool);

            return res.json(exp.json());
        } catch (err) {
            return Err.respond(err, res);
        }
    });


    /**
     * @api {post} /api/github/event Github Webhook
     * @apiVersion 1.0.0
     * @apiName Github
     * @apiGroup Webhooks
     * @apiPermission admin
     *
     * @apiDescription
     *   Callback endpoint for GitHub Webhooks. Should not be called by user functions
     */
    await schema.post( '/github/event', null,
        async (req, res) => {
            if (!process.env.GithubSecret) return res.status(400).send('Invalid X-Hub-Signature');

            const ghverify = new Webhooks({
                secret: process.env.GithubSecret
            });

            if (!ghverify.verify(req.body, req.headers['x-hub-signature'])) {
                res.status(400).send('Invalid X-Hub-Signature');
            }

            try {
                if (req.headers['x-github-event'] === 'push') {
                    await ci.push(pool, req.body);

                    res.json(true);
                } else if (req.headers['x-github-event'] === 'pull_request') {
                    await ci.pull(pool, req.body);

                    res.json(true);
                } else if (req.headers['x-github-event'] === 'issue_comment') {
                    await ci.issue(pool, req.body);

                    res.json(true);
                } else {
                    res.status(200).send('Accepted but ignored');
                }
            } catch (err) {
                return Err.respond(err, res);
            }
        });

    /**
     * @api {post} /api/opencollective/event OpenCollective
     * @apiVersion 1.0.0
     * @apiName OpenCollective
     * @apiGroup Webhooks
     * @apiPermission admin
     *
     * @apiDescription
     *   Callback endpoint for OpenCollective. Should not be called by user functions
     */
    await schema.post( '/opencollective/event', null,
        async (req, res) => {
            try {
                console.error(req.headers);
                console.error(req.body);

                res.status(200).send('Accepted but ignored');
            } catch (err) {
                return Err.respond(err, res);
            }
        });

    schema.router.use((err, req, res, next) => {
        if (err instanceof ValidationError) {
            let errs = [];

            if (err.validationErrors.body) {
                errs = errs.concat(err.validationErrors.body.map((e) => {
                    return { message: e.message };
                }));
            }

            if (err.validationErrors.query) {
                errs = errs.concat(err.validationErrors.query.map((e) => {
                    return { message: e.message };
                }));
            }

            return Err.respond(
                new Err(400, null, 'validation error'),
                res,
                errs
            );
        } else {
            next(err);
        }
    });

    schema.router.all('*', (req, res) => {
        return res.status(404).json({
            status: 404,
            message: 'API endpoint does not exist!'
        });
    });

    const srv = app.listen(4999, (err) => {
        if (err) return err;

        if (cb) return cb(srv, config);

        console.log('ok - http://localhost:4999');
    });
}

=======
>>>>>>> 4216367e2bbdb933128338555dfb05ca0b7ceacd
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

module.exports = configure;
