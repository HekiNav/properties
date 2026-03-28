module.exports = {
  apps : [{
    name   : "oikotie-proxy",
    script : "./index.js",
    cron_restart : '0 * * * *'
  }]
}
