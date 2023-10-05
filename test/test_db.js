const oracledb = require('oracledb');
oracledb.initOracleClient();
oracledb.autoCommit = true;
const config = {
    poolAlias: 'test',
    user: process.env.TEST_USER,
    password: process.env.TEST_PASSWORD,
    connectString: process.env.TEST_CONNECT_STRING,
    poolMin: 1,
    poolMax: 2
};

exports.config = config;

exports.connect = () => oracledb.createPool(config);
exports.get = () => oracledb.getPool(config.poolAlias);
exports.disconnect = () => oracledb.getPool(config.poolAlias).close();