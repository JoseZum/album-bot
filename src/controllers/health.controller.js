const { healthCheck } = require('../services/health.service');

const getHealth = (req, res) => {
  res.status(200).json(healthCheck());
};

module.exports = { getHealth };