const expect = require('chai').expect;
const db = require('./test_db');
const OracleSessionStore = require('../index.js');


describe('defaults', function() {
    let storeGeneratorFn = (t) => () => new OracleSessionStore(t)

    it('should throw error with unvalid parameter types', function() {
        expect(storeGeneratorFn('')).to.throw(TypeError)
        expect(storeGeneratorFn(43)).to.throw(TypeError)
        expect(storeGeneratorFn(() => {})).to.throw(TypeError)
        expect(storeGeneratorFn(true)).to.throw(TypeError)
        expect(storeGeneratorFn([1, 2, 3])).to.throw(TypeError)
        expect(storeGeneratorFn(null)).to.throw(TypeError)
        expect(storeGeneratorFn()).to.throw(TypeError)
    })

    it('should throw error with empty object', function() {
        expect(storeGeneratorFn({})).to.throw(TypeError);
    })

    let store = new OracleSessionStore({ pool: {...db.config, poolAlias: 'test0'} });
    it('should have defaults', function() {
        expect(store.tableName).to.equal('STORED_SESSIONS');
        expect(store.ttl).to.equal(86400);
        expect(store.disableTouch).to.be.false;
    })

    it('should have all methods for express-session', function() {
        expect(store.all).to.exist;
        expect(store.destroy).to.exist;
        expect(store.clear).to.exist;
        expect(store.length).to.exist;
        expect(store.get).to.exist;
        expect(store.set).to.exist;
        expect(store.touch).to.exist;
    })

    store.close();
})


describe('oracledb', function() {
    beforeEach(async function () {
        this.timeout(10000);
        try {
            await db.disconnect();
        } catch {}
        await db.connect();
    });

    it('accept passing oracledb pool instance', function() {
        const pool = db.get(db.config.poolAlias);
        const store = new OracleSessionStore({ pool });
        expect(store.pool).to.exist;
        expect(store.pool).to.equal(pool);
    })

    it('accept passing oracledb pool alias', function() {
        const store = new OracleSessionStore({ pool: db.config.poolAlias });
        expect(store.pool).to.exist;
        expect(store.pool.poolAlias).to.equal(db.config.poolAlias);
    })

    it('accept creating oracledb connection', function() {
        const store = new OracleSessionStore({ pool: db.config });
        expect(store.pool).to.exist;
        expect(store.pool.poolAlias).to.equal(db.config.poolAlias);
    })

    it('works with callbacks', function(done) {
        this.timeout(30000)
        const store = new OracleSessionStore({ pool: db.config.poolAlias });
        lifecyfleTestWithCb(store, done);
    })

    it('works with promises', function(done) {
        this.timeout(30000)
        const store = new OracleSessionStore({ pool: db.config.poolAlias });
        lifecycleTestWithPromise(store).then(done).catch(done);
    })
})



/**
 * 
 * @param {OracleSessionStore} store 
 * @param {Function} cb 
 */
function lifecyfleTestWithCb(store, cb) {
    let exampleSession = { foo: 'bar' }
    const sessionId = Date.now().toString()
    store.set(sessionId, exampleSession, (err) => {
        if(err) return cb(err);
        store.get(sessionId, (err, value) => {
            if(err) return cb(err);
            expect(value).to.exist;
            expect(value).to.eql(exampleSession);

            let expiration = (new Date(Date.now() + 86400000)).toISOString();
            exampleSession.cookie = { expires: expiration }
            store.touch(sessionId, exampleSession, (err) => {
                if(err) return cb(err);
                store.destroy(sessionId, (err) => {
                    if(err) return cb(err);
                    store.get(sessionId, (err, emptySession) => {
                        if(err) return cb(err);
                        expect(emptySession).to.be.null;
                        store.clear((err) => {
                            if(err) return cb(err);
                            store.length((err, total) => {
                                if(err) return cb(err);
                                expect(total).to.equal(0);
                                return cb();
                            })
                        })
                    })
                })
            })
        })
    })
}

/**
 * 
 * @param {OracleSessionStore} store 
 * @returns {Promise}
 */
async function lifecycleTestWithPromise(store) {
    let exampleSession = { foo: 'bar' }
    const sessionId = Date.now().toString()
    await store.set(sessionId, exampleSession);
    let requestedSession = await store.get(sessionId);
    expect(requestedSession).to.exist;
    expect(requestedSession).to.eql(exampleSession);
    let expiration = (new Date(Date.now() + 86400000)).toISOString();
    exampleSession.cookie = { expires: expiration }
    await store.touch(sessionId, exampleSession)
    await store.destroy(sessionId)
    let emptySession = await store.get(sessionId);
    expect(emptySession).to.be.null;
    await store.clear();
    let total = await store.length();
    expect(total).to.equal(0);
}