const oracledb = require('oracledb');
const session = require('express-session');
const DEFAULT_TABLE_NAME = 'STORED_SESSIONS'
const TABLE_SID_COLUMN = 'sid'
const TABLE_EXPIRES_COLUMN = 'expires'
const TABLE_DATA_COLUMN = 'data'

/**
 * This callback type is called `responseCallback`
 *
 * @callback responseCallback
 * @param {error} error
 * @param {*} [value]
 */

/**
 * This callback type is called `retryCallback`
 *
 * @callback retryCallback
 */

class OracleSessionStore extends session.Store {

    constructor(opts = {}) {
        super();
        if(typeof opts !== typeof {} || opts instanceof Array) {
            throw new TypeError('Incorrect parameter type provided: OracleSessionStore expects an object')
        }
        this.tableName = opts.tableName || DEFAULT_TABLE_NAME
        this.ttl = opts.ttl || 86400 // One day in seconds.
        this.disableTouch = opts.disableTouch || false
        if(!opts.pool) {
            throw new TypeError('Property pool is expected');
        }
        switch(typeof opts.pool) {
            case 'string':
                this.pool = oracledb.getPool(opts.pool);
                break;
            case 'object':
                if(opts.pool.getConnection) {
                    this.pool = opts.pool;
                } else {
                    try {
                        this.pool = oracledb.getPool(opts.pool.poolAlias);
                        this.pool.reconfigure(opts.pool)
                    } catch {
                        oracledb.createPool(opts.pool).then(pool => this.pool = pool);
                    }
                }
                break;
            default:
                throw new TypeError('Incorrect pool type provided, expects a poolAlias string, a pool connection or pool configuration object')
        }
    }


    /**
     * 
     * @param {responseCallback} [cb] - Callback used in action
     * @param {retryCallback} retry - Callback for retry action
     * @returns {Promise}
     */
    _promiseCatchHandler(cb, retry) {
        return (err) => {
            // If table was not found
            if(err.code === "ORA-00942") {
                const sql = `CREATE TABLE ${this.tableName} (${TABLE_SID_COLUMN} VARCHAR(128) NOT NULL PRIMARY KEY, ${TABLE_DATA_COLUMN} CLOB CHECK (${TABLE_DATA_COLUMN} IS JSON), ${TABLE_EXPIRES_COLUMN} TIMESTAMP)`;
                return this.pool.getConnection()
                .then(conn =>
                    conn.execute(sql, [], { autoCommit: true }))
                // retry
                .then(() => retry())
                // recursive send error
                .catch(this._promiseCatchHandler(cb, retry))
            }
            if(cb) return cb(err);
            throw err;
        }
    }


    /**
     * 
     * @param {Function} fn 
     * @param  {...any} args 
     * @returns {retryCallback}
     */
    _retryHandler(fn, ...args) {
        return () => fn(...args)
    }

    /**
     * Get all stored sessions
     * @param {responseCallback} [cb] - Callback function, should be called as cb(error, sessions)
     * @returns {Promise}
     */
    all(cb) {
        const sql = `SELECT ${TABLE_DATA_COLUMN} as data FROM ${this.tableName}`;
        return this.pool.getConnection().then(conn => conn.execute(sql, [], { fetchInfo: {"data": {type: oracledb.STRING } }, outFormat: oracledb.OUT_FORMAT_OBJECT })
        .then(({ rows }) => Promise.all(rows.map(r => r.data.getData())))
            .then(values => conn.close().then(() => {
                values = values.map(s => JSON.parse(s));
                if(cb) cb(null, values);
                return values;
            }).catch(this._promiseCatchHandler(cb, this._retryHandler(this.all, cb))))
            .catch(this._promiseCatchHandler(cb, this._retryHandler(this.all, cb)))
        ).catch(this._promiseCatchHandler(cb, this._retryHandler(this.all, cb)));
    }

    /**
     * Destroy/delete requested session
     * @param {string} sid - Session ID
     * @param {responseCallback} [cb] - Callback function, should be called as cb(error) once the session is destroyed
     * @returns {Promise}
     */
    destroy(sid, cb) {
        const sql = `DELETE FROM ${this.tableName} WHERE ${TABLE_SID_COLUMN} = :sid`;
        return this.pool.getConnection().then(conn => conn.execute(sql, [sid], { autoCommit: true })
            .then(() => conn.close().then(() => {
                if(cb) cb(null);
                return ;
            }).catch(this._promiseCatchHandler(cb, this._retryHandler(this.destroy, cb))))
            .catch(this._promiseCatchHandler(cb, this._retryHandler(this.destroy, cb)))
        ).catch(this._promiseCatchHandler(cb, this._retryHandler(this.destroy, cb)));
    }

    /**
     * Delete all stored sessions
     * @param {responseCallback} [cb] - Callback function, should be called as cb(error) once store is cleared
     * @returns {Promise}
     */
    clear(cb) {
        const sql = `DELETE FROM ${this.tableName}`;
        return this.pool.getConnection().then(conn => conn.execute(sql, [], { autoCommit: true })
            .then(() => conn.close().then(() => {
                if(cb) cb(null);
                return ;
            }).catch(this._promiseCatchHandler(cb, this._retryHandler(this.clear, cb))))
            .catch(this._promiseCatchHandler(cb, this._retryHandler(this.clear, cb)))
        ).catch(this._promiseCatchHandler(cb, this._retryHandler(this.clear, cb)));
    }

    /**
     * Returns total stored sessions
     * @param {responseCallback} [cb] - Callback function, should be called as cb(error, len)
     * @returns {Promise}
     */
    length(cb) {
        const sql = `SELECT COUNT(*) AS TOTAL FROM ${this.tableName}`;
        return this.pool.getConnection().then(conn => conn
            .execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT })
            .then(value => conn.close().then(() => {
                value = value.rows[0].TOTAL;
                if(cb) cb(null, value);
                return value;
            }).catch(this._promiseCatchHandler(cb, this._retryHandler(this.length, cb))))
            .catch(this._promiseCatchHandler(cb, this._retryHandler(this.length, cb)))
        ).catch(this._promiseCatchHandler(cb, this._retryHandler(this.length, cb)));
    }

    /**
     * Find session from its Session ID, if this session is not found should return null or undefined
     * @param {string} sid Session ID
     * @param {responseCallback} [cb] - Callback function, should be called as cb(error, session) after search for a session
     * @returns {Promise}
     */
    get(sid, cb) {
        return this.pool.getConnection().then(conn => conn
            .execute(`SELECT ${TABLE_DATA_COLUMN} as data FROM ${this.tableName} WHERE ${TABLE_SID_COLUMN} = :sid`,
            [sid],
            { maxRows: 1, fetchInfo: { "data": {dir: oracledb.BIND_OUT, type: oracledb.STRING }} })
            .then(({ rows }) => (rows.length > 0 && rows[0][0]) ? rows[0][0].getData() : Promise.resolve(null))
            .then(value => conn.close().then(() => {
                if(value) {
                    value = JSON.parse(value);
                }
                if(cb) cb(null, value);
                return value;
            }).catch(this._promiseCatchHandler(cb, this._retryHandler(this.get, sid, cb))))
            .catch(this._promiseCatchHandler(cb, this._retryHandler(this.get, sid, cb)))
        ).catch(this._promiseCatchHandler(cb, this._retryHandler(this.get, sid, cb)))
    }

    _getExpiration(session) {
        if(this.disableTouch) return null;

        if(session?.cookie?.expires) {
            return new Date(session.cookie.expires);
        }
        return new Date(Date.now() + (this.ttl * 1000))
    }

    /**
     * Save/update session from its Session ID
     * @param {string} sid Session ID
     * @param {SessionData} session to store
     * @param {responseCallback} [cb] - Callback function, should be called as cb(error) once the session has been set in the store
     * @returns {Promise}
     */
    async set(sid, session, cb) {
        const expires = this._getExpiration(session);
        const expiresSql = !expires ? 'NULL' : ':expires';
        const sql = `MERGE INTO ${this.tableName} USING dual ON (${TABLE_SID_COLUMN} = :sid)
        WHEN MATCHED THEN UPDATE SET ${TABLE_DATA_COLUMN} = :data, ${TABLE_EXPIRES_COLUMN} = ${expiresSql}
        WHEN NOT MATCHED THEN INSERT (${TABLE_SID_COLUMN}, ${TABLE_DATA_COLUMN}, ${TABLE_EXPIRES_COLUMN}) VALUES (:sid, :data, ${expiresSql})`;
        return this.pool.getConnection().then(conn => conn.execute(sql, {
            sid: { dir: oracledb.BIND_IN, val: sid, type: oracledb.STRING },
            data: { dir: oracledb.BIND_IN, val: JSON.stringify(session), type: oracledb.STRING },
            expires: { bind: oracledb.BIND_IN, val: expires, type: oracledb.DB_TYPE_TIMESTAMP }
        }, { autoCommit: true })
            .then(() => conn.close().then(() => {
                if(cb) cb(null);
                return ;
            }).catch(this._promiseCatchHandler(cb, this._retryHandler(this.set, sid, session, cb))))
            .catch(this._promiseCatchHandler(cb, this._retryHandler(this.set, sid, session, cb)))
        ).catch(this._promiseCatchHandler(cb, this._retryHandler(this.set, sid, session, cb)));
    }

    /**
     * Primarily used when the store will automatically delete idle sessions and this method is used to signal to the store the given session is active, potentially resetting the idle timer.
     * @param {string} sid Session ID 
     * @param {SessionData} session to be expired
     * @param {responseCallback} [cb] - Callback funcrtion, should be called as cb(error) once the session has been touched
     * @returns {Promise}
     */
    async touch(sid, session, cb) {
        if(this.disableTouch) {
            if(cb) cb(null);
            return ;
        }

        const expires = this._getExpiration(session);
        const sql = `UPDATE ${this.tableName} SET
        ${TABLE_EXPIRES_COLUMN}=:expires
        WHERE ${TABLE_SID_COLUMN}=:sid`;
        return this.pool.getConnection().then(conn => conn.execute(sql, {
            sid: { dir: oracledb.BIND_IN, val: sid, type: oracledb.STRING },
            expires: { bind: oracledb.BIND_IN, val: expires, type: oracledb.DB_TYPE_TIMESTAMP }
        }, { autoCommit: true })
            .then(() => conn.close().then(() => {
                if(cb) cb(null);
                return ;
            }).catch(this._promiseCatchHandler(cb, this._retryHandler(this.touch, sid, session, cb))))
            .catch(this._promiseCatchHandler(cb, this._retryHandler(this.touch, sid, session, cb)))
        ).catch(this._promiseCatchHandler(cb, this._retryHandler(this.touch, sid, session, cb)));
    }

    /**
     * Close connection
     * @returns {Promise}
     */
    async close() {
        await this.pool.close();
    }

}

module.exports = OracleSessionStore;