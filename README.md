# oracle-session
Creates session store for [express-session](https://www.npmjs.com/package/express-session) and saving data into Oracle Autonomous Transaction Database, Oracle Database, Oracle Express Database.


### Pre-requisites


### Install

Pre-requisites:
    - oracledb. See package [here](https://node-oracledb.readthedocs.io/en/latest/).
    - express-session. See package [here](https://www.npmjs.com/package/express-session).

Install using npm or yarn, like:

```
npm i oracle-session -s
```

### Usage

```
const session = require('express-session');
const OracleSession = require('oracle-session');

// ...

// recommended: init pool before passing
const pool = await oracledb.createPool(config);

const oracleStore = new OracleSession({ pool });
app.use(session({
    store: oracleStore,
    secret: "my secret key",
}));

```

**Config options**

|   Property   |    Type    |         Description          |
| ------------ | ---------- | ---------------------------- |
| pool  | string, [Pool](https://node-oracledb.readthedocs.io/en/latest/api_manual/pool.html), [PoolAttributes](https://node-oracledb.readthedocs.io/en/latest/api_manual/oracledb.html#oracledb.createPool)    | Pool connection, you can also pass the pool alias or a pool configuration and this library creates the pool |
| tableName `(optional)` | string     | Name to be used in table creation. Defaults to `STORED_SESSIONS` |
| ttl `(optional)`    | integer    | Seconds before session expiration. Defaults to 86400 |
| disableTouch `(optional)` | integer | Disable session expiration. Defaults to `false` |


### Contributing

Any contribution is well received. I try to maintain the format of Conventional Commits by using [gitmoji](https://github.com/carloscuesta/gitmoji-cli). Read more about Conventional Commits [here](https://www.conventionalcommits.org/en/v1.0.0/#summary).

