var Promise       = require('bluebird')
  , config        = require('config-url')
  , Scheduler     = require('crontab-core-engine/lib/scheduler')
  , http          = require('crontab-core-engine/lib/http')
  , ascoltatori   = require('ascoltatori')
  , redis         = require('redis')
  ;

let redis_options = {
    db        : config.get('cron.redis.db')
  , host      : config.getUrlObject('cron.redis').host
  , port      : config.getUrlObject('cron.redis').port
  , password  : config.get('cron.redis.password')
};

let scheduler = new Scheduler({ redis_options });

scheduler.monitor();

http
  .listen({ port : config.get('cron.port')  })
  .then((app) => {
    app.scheduler = scheduler;
    app.limit = config.get('cron.limit_per_crontab');
  });


Promise
  .try(() => {
    let options = {
        db        : config.get('pubsub.db')
      , host      : config.getUrlObject('pubsub').host
      , port      : config.getUrlObject('pubsub').port
      , password  : config.get('pubsub.password')
      , type      : 'redis'
      , redis
    };

    return Promise.fromCallback((cb) => ascoltatori.build(options, cb));
  })
  .then((store) => {
    store.subscribe('codedb/pull/crontab', (key, msg) => {
      var remote          = msg.remote   //|| 'https://github.com/a7medkamel/taskmill-core-agent.git'
        , branch          = msg.branch   || 'master'
        , text            = msg.blob
        , key             = `cron:repository:${remote}:${branch}`
        ;

      return scheduler
              .update_from_text(key, text, { remote, branch })
              .catch((err) => {
                winston.error(err);
              });
    });
  })
  .catch((err) => {
    winston.error(err);
  });
