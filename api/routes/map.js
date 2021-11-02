<<<<<<< HEAD
'use strict';

const Err = require('../lib/error');
const { Miss } = require('../lib/cacher');
const { Param } = require('../lib/util');
const Map = require('../lib/map');
=======
const { Err } = require('@openaddresses/batch-schema');
const Map = require('../lib/map');
const Cacher = require('../lib/cacher');
const Miss = Cacher.Miss;
>>>>>>> 4216367e2bbdb933128338555dfb05ca0b7ceacd

async function router(schema, config) {
    /**
     * @api {get} /api/map Coverage TileJSON
     * @apiVersion 1.0.0
     * @apiName TileJSON
     * @apiGroup Map
     * @apiPermission public
     *
     * @apiDescription
     *   Data required for map initialization
     */
<<<<<<< HEAD
    await schema.get( '/map', null, (req, res) => {
        return res.json(Map.map());
    });

    /**
     * @api {get} /api/map/:mapid Map Feature
     * @apiVersion 1.0.0
     * @apiName MapFeature
=======
    await schema.get('/map', null,
        (req, res) => {
            return res.json(Map.map());
        });

    /**
     * @api {get} /api/map/borders/:z/:x/:y.mvt Borders MVT
     * @apiVersion 1.0.0
     * @apiName BorderVectorTile
>>>>>>> 4216367e2bbdb933128338555dfb05ca0b7ceacd
     * @apiGroup Map
     * @apiPermission public
     *
     * @apiDescription
<<<<<<< HEAD
     *   Get a single Map Object
     */
    await schema.get( '/map/:mapid', null, async (req, res) => {
        await Param.int(req, 'mapid');

        return res.json(await Map.from_id(config.pool, req.params.mapid));
    });

    /**
     * @api {get} /api/map/borders/:z/:x/:y.mvt Borders MVT
     * @apiVersion 1.0.0
     * @apiName BorderVectorTile
=======
     *   Retrive borders Mapbox Vector Tiles
     *
     * @apiParam {Number} z Z coordinate
     * @apiParam {Number} x X coordinate
     * @apiParam {Number} y Y coordinate
     */
    await schema.get('/map/borders/:z/:x/:y.mvt', {
        ':z': 'integer',
        ':x': 'integer',
        ':y': 'integer'
    }, async (req, res) => {
        try {
            if (req.params.z > 5) throw new Error(400, null, 'Up to z5 is supported');

            const tile = await config.cacher.get(Miss(req.query, `tile-borders-${req.params.z}-${req.params.x}-${req.params.y}`), async () => {
                return await Map.border_tile(config.pool, req.params.z, req.params.x, req.params.y);
            }, false);

            res.type('application/vnd.mapbox-vector-tile');

            return res.send(tile);
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    /**
     * @api {get} /api/map/fabric Fabric TileJSON
     * @apiVersion 1.0.0
     * @apiName FabricVectorTile
>>>>>>> 4216367e2bbdb933128338555dfb05ca0b7ceacd
     * @apiGroup Map
     * @apiPermission public
     *
     * @apiDescription
<<<<<<< HEAD
     *   Retrive borders Mapbox Vector Tiles
     *
     * @apiParam {Number} z Z coordinate
     * @apiParam {Number} x X coordinate
     * @apiParam {Number} y Y coordinate
     */
    await schema.get( '/map/borders/:z/:x/:y.mvt', null,
        async (req, res) => {
            try {
                await Param.int(req, 'z');
                await Param.int(req, 'x');
                await Param.int(req, 'y');

                if (req.params.z > 5) throw new Error(400, null, 'Up to z5 is supported');

                const tile = await config.cacher.get(Miss(req.query, `tile-borders-${req.params.z}-${req.params.x}-${req.params.y}`), async () => {
                    return await Map.border_tile(config.pool, req.params.z, req.params.x, req.params.y);
                }, false);

                res.type('application/vnd.mapbox-vector-tile');

                return res.send(tile);
            } catch (err) {
                return Err.respond(err, res);
            }
        });
=======
     *   Return a TileJSON for the current fabric
     *
     * @apiSchema {jsonschema=../schema/res.TileJSON.json} apiSuccess
     */
    await schema.get('/map/fabric', {
        res: 'res.TileJSON.json'
    }, async (req, res) => {
        try {
            res.json(config.tb.tilejson());
        } catch (err) {
            return Err.respond(new Err(404, err, 'No Tile Found'), res);
        }
    });
>>>>>>> 4216367e2bbdb933128338555dfb05ca0b7ceacd

    /**
     * @api {get} /api/map/fabric/:z/:x/:y.mvt Fabric MVT
     * @apiVersion 1.0.0
     * @apiName FabricVectorTile
     * @apiGroup Map
     * @apiPermission public
     *
     * @apiDescription
     *   Retrive fabric Mapbox Vector Tiles
     *
     * @apiParam {Number} z Z coordinate
     * @apiParam {Number} x X coordinate
     * @apiParam {Number} y Y coordinate
     */
<<<<<<< HEAD
    await schema.get( '/map/fabric/:z/:x/:y.mvt', null,
        async (req, res) => {
            await Param.int(req, 'z');
            await Param.int(req, 'x');
            await Param.int(req, 'y');

            let tile;
            try {
                tile = await config.cacher.get(Miss(req.query, `tile-fabric-${req.params.z}-${req.params.x}-${req.params.y}`), async () => {
                    return await Map.fabric_tile(tb, req.params.z, req.params.x, req.params.y);
                }, false);

                if (tile.length === 0) {
                    throw new Err(404, null, 'No Tile Found');
                }
            } catch (err) {
                return Err.respond(new Err(404, err, 'No Tile Found'), res);
            }

            res.writeHead(200, {
                'Content-Type': 'application/vnd.mapbox-vector-tile',
                'Content-Encoding': 'gzip'
            });
            res.end(tile);
        });
=======
    await schema.get('/map/fabric/:z/:x/:y.mvt', {
        ':z': 'integer',
        ':x': 'integer',
        ':y': 'integer'
    }, async (req, res) => {
        let tile;
        try {
            const encodings = req.headers['accept-encoding'].split(',').map((e) => e.trim());
            if (!encodings.includes('gzip')) throw new Err(400, null, 'Accept-Encoding must include gzip');

            tile = await config.cacher.get(Miss(req.query, `tile-fabric-${req.params.z}-${req.params.x}-${req.params.y}`), async () => {
                return await Map.fabric_tile(config.tb, req.params.z, req.params.x, req.params.y);
            }, false);

            if (tile.length === 0) {
                throw new Err(404, null, 'No Tile Found');
            }
        } catch (err) {
            return Err.respond(new Err(404, err, 'No Tile Found'), res);
        }

        res.writeHead(200, {
            'Content-Type': 'application/vnd.mapbox-vector-tile',
            'Content-Encoding': 'gzip',
            'cache-control': 'no-transform'
        });
        res.end(tile);
    });
>>>>>>> 4216367e2bbdb933128338555dfb05ca0b7ceacd

    /**
     * @api {get} /api/map/:z/:x/:y.mvt Coverage MVT
     * @apiVersion 1.0.0
     * @apiName VectorTile
     * @apiGroup Map
     * @apiPermission public
     *
     * @apiDescription
     *   Retrive coverage Mapbox Vector Tiles
     *
     * @apiParam {Number} z Z coordinate
     * @apiParam {Number} x X coordinate
     * @apiParam {Number} y Y coordinate
     */
<<<<<<< HEAD
    await schema.get( '/map/:z/:x/:y.mvt', null,
        async (req, res) => {
            try {
                await Param.int(req, 'z');
                await Param.int(req, 'x');
                await Param.int(req, 'y');

                if (req.params.z > 5) throw new Error(400, null, 'Up to z5 is supported');


                const tile = await config.cacher.get(Miss(req.query, `tile-${req.params.z}-${req.params.x}-${req.params.y}`), async () => {
                    return await Map.tile(config.pool, req.params.z, req.params.x, req.params.y);
                }, false);

                res.type('application/vnd.mapbox-vector-tile');

                return res.send(tile);
            } catch (err) {
                return Err.respond(err, res);
            }
        });
=======
    await schema.get('/map/:z/:x/:y.mvt', {
        ':z': 'integer',
        ':x': 'integer',
        ':y': 'integer'
    }, async (req, res) => {
        try {
            if (req.params.z > 5) throw new Error(400, null, 'Up to z5 is supported');

            const tile = await config.cacher.get(Miss(req.query, `tile-${req.params.z}-${req.params.x}-${req.params.y}`), async () => {
                return await Map.tile(config.pool, req.params.z, req.params.x, req.params.y);
            }, false);

            res.type('application/vnd.mapbox-vector-tile');

            return res.send(tile);
        } catch (err) {
            return Err.respond(err, res);
        }
    });

>>>>>>> 4216367e2bbdb933128338555dfb05ca0b7ceacd
}

module.exports = router;
