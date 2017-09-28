import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { runGraphQLServer } from 'meteor-graphql-rxjs';
declare const ServiceConfiguration: any;

// GQL stuff
import defaultQuery from './defaultQuery';
import { schema } from './schema';

import { Messages } from './collections/messages';
import { Users } from './collections/users';
import { Chats } from './collections/chats';
import { Pictures } from './collections/pictures';
import { facebookService } from "./services/facebook";
// ------

Meteor.startup(() => {
  if (Meteor.settings) {
    Object.assign(Accounts._options, Meteor.settings['accounts-phone']);
    SMS.twilio = Meteor.settings['twilio'];
  }

  // Configuring oAuth services
  const services = Meteor.settings.private.oAuth;

  if (services) {
    for (let service in services) {
      ServiceConfiguration.configurations.upsert({service: service}, {
        $set: services[service]
      });
    }
  }
});

// TODO: Not sure we want to start GraphQL in here.
// is there a better way?
Meteor.startup(() => {
  const sub = runGraphQLServer(Npm.require, {
    schema,
    graphiql: true,
    graphiqlQuery: defaultQuery,
    createContext: (payload) => ({
      Messages,
      Users,
      Chats,
      Pictures,
      facebookService,
    }),
  })
  .subscribe(undefined, (error) => {
    console.error('GraphQL Server Failed:', error);
  });
});
