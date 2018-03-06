var Promise     = require('bluebird')
  , winston     = require('winston')
  , _           = require('lodash')
  , request     = require('request')
  , parsecurl   = require('parse-curl')
  , onFinished  = require('on-finished')
  , account_sdk = require('taskmill-core-account-sdk')
  , git         = require('taskmill-core-git')
  , Clock       = require('crontab-core-engine/lib/clock')
  , config      = require('config-url')
  ;

Promise.config({
  longStackTraces: true
})

process.on('unhandledRejection', (err, p) => {
  winston.error(err);
});

process.on('uncaughtException', (err) => {
  winston.error(err);
});

let handler = (e) => {
  let { key, meta, command } = e;

  return Promise
          .try(() => {
            // ex: https://github.com/codingdawg/taskmill-help.git
            let { remote, branch }      = meta
              , { hostname, username }  = git.parse(remote)
              ;

            return { hostname, username };
          })
          .catch(() => {})
          .then((remote) => {
            if (remote) {
              let { hostname, username } = remote;

              return account_sdk
                      .issueTokenByUsername(hostname, username)
                      .catch({ message : 'not found' }, () => {});
            }
          })
          .then((jwt) => {
            return Promise
                    .resolve(parsecurl(command))
                    .tap((curl) => {
                      if (!curl) {
                        throw new Error('parse-curl "' + key + '" "' + command + '"');
                      }
                    })
                    .then((curl) => {
                      let { header } = curl;
                      if (jwt) {
                        header = _.extend({ authorization : 'Bearer ' + jwt }, header);
                      }

                      return {
                          url     : curl.url
                        , headers : header
                        , method  : curl.method
                        , body    : curl.body
                      };
                    })
                    .then((opt) => {
                      winston.info(opt);

                      let stream = request(opt);

                      return Promise.fromCallback((cb) => { onFinished(stream, cb); });
                    })
                    .catch((err) => {
                      winston.warn('exec', key, command, err.toString());
                    });
          });
};

let redis_options = {
    db        : config.get('cron.redis.db')
  , host      : config.getUrlObject('cron.redis').host
  , port      : config.getUrlObject('cron.redis').port
  , password  : config.get('cron.redis.password')
};

(new Clock({ handler, redis_options })).monitor();
