const {Client} = require('@elastic/elasticsearch');

const hosts = process.env.ELASTICSEARCH_HOSTS || 'http://localhost:9200';
const nodes = hosts.split(',');
const esClient = new Client({
    nodes: nodes,
});

module.exports = esClient;