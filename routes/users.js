var express = require("express");
var router = express.Router();
var nf = import("node-fetch");
const { exec } = require("child_process");
const https = require('https');
const axios = require('axios');


/* GET users listing. */
router.get("/", function (req, res, next) {
  res.send("respond with a resource");
});

module.exports = router;
