import { makeExecutableSchema } from 'graphql-schema-tools';
import * as moment from 'moment';
import { _ } from 'meteor/underscore';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/operator/switchMap';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/debounce';
import 'rxjs/add/observable/fromPromise';
import 'rxjs/add/observable/of';

const typeDefs = `
type Query {
  me: User
  myFacebookProfile: FbProfile!
  contacts(searchPattern: String, phoneBook: [String!]): [User!]!
  allChats: [Chat!]
  chat(_id: ID!): Chat
}

enum MessageType {
  TEXT
  LOCATION
  PICTURE
}

enum PlatformType {
  WEB
  ANDROID
  IOS
}

type Chat {
  _id: ID!
  lastMessage: Message
  members: [User!]
  messageCount: Int
  messages(limit: Int): [MessageByDay!]

  title: String
  picture: Picture
}

type Message {
  _id: ID!
  chat: Chat!
  sender: User!
  content: String!
  createdAt: String
  type: MessageType!
  ownership: Boolean!
}

type MessageByDay {
  timestamp: String
  messages: [Message!]
  today: Boolean
}

type User {
  _id: ID!
  createdAt: String
  name: String
  picture: Picture
}

type Picture {
  _id: ID
  url(platform: PlatformType): String
}

type FbProfile {
  name: String
  pictureUrl: String
}

input InputProfile {
  name: String!
  pictureId: ID
}

type Mutation {
  addChat(receiverId: ID!): Boolean
  removeChat(chatId: ID!): Boolean
  updateProfile(profile: InputProfile!): Boolean
  addMessage(type: MessageType!, chatId: ID!, content: String!): Boolean
  saveFcmToken(token: String): Boolean
}
`;

const resolvers = {
  Mutation: {
    addChat(root, args, ctx) {
      return this.call('addChat', args.receiverId)
        .then(() => true);
    },
    removeChat(root, args, ctx) {
      return this.call('removeChat', args.chatId)
        .then(() => true);
    },
    updateProfile(root, args, ctx) {
      return this.call('updateProfile', args.profile)
        .then(() => true);
    },
    addMessage(root, args, ctx) {
      return this.call('addMessage', args.type.toLowerCase(), args.chatId, args.content)
        .then(() => true);
    },
    saveFcmToken(root, args, ctx) {
      return this.call('saveFcmToken', args.token)
        .then(() => true);
    },
  },
  Query: {
    me(root, args, ctx) {
      return this.userId$.switchMap((userId: string) => {
        if ( !userId ) {
          return null;
        }

        return ctx.Users.find({ _id: userId }, {
          limit: 1,
          fields: { profile: 1 },
        })
          .map((v) => v[0]);
      });
    },
    contacts(root, args, ctx) {
      return this.userId$.switchMap((userId: string) => {
        if ( !userId ) {
          return [];
        }

        const pattern = args.searchPattern;
        let contacts = args.phoneBook || [];
        let selectorPromise = Promise.resolve(ctx.Users.findOne({'_id': userId}))
          .then((user) => {
            if ( !user.services.facebook ) {
              return [];
            }

            return ctx.facebookService.getAccessToken(userId)
              .then((accessToken) => ctx.facebookService.getFriends(accessToken)
              )
                .then((facebookFriends: any[]) => facebookFriends.map((friend) => friend.id));
          })
            .then((facebookFriendsIds) => {
              if (pattern) {
                return {
                  'profile.name': { $regex: pattern, $options: 'i' },
                  $or: [
                    {'phone.number': {$in: contacts}},
                    {'services.facebook.id': {$in: facebookFriendsIds}}
                  ]
                };
              } else {
                return {
                  $or: [
                    {'phone.number': {$in: contacts}},
                    {'services.facebook.id': {$in: facebookFriendsIds}}
                  ]
                };
              }
            });

            return Observable.fromPromise(selectorPromise)
              .switchMap((selector) => ctx.Users.find(selector, {
                fields: { profile: 1 },
                limit: 15
              }));
        });
      },
      chat(root, args, ctx) {
        return this.userId$.switchMap((userId: string) => {
          if ( !userId ) {
            return null;
          }

          return ctx.Chats.find({
            _id: args._id,
            memberIds: userId
          }, { limit: 1 })
            .map((v) => v.length ? v[0] : null);
        });
      },
      allChats(roots, args, ctx) {
        return this.userId$.switchMap((userId: string) => {
          if ( !userId ) {
            return [];
          }

          return ctx.Chats.find({ memberIds: userId });
        });
      },
      myFacebookProfile(root, args, ctx) {
        return this.userId$.switchMap((userId: string) => {
          if (!userId) {
            return null;
          }

          if (!ctx.Users.collection.findOne({ _id: userId }).services.facebook) {
            throw new Meteor.Error('unauthorized', 'User must be logged-in with Facebook to call this method');
          }

          //TODO: handle error: token may be expired
          return ctx.facebookService.getAccessToken(userId)
            .then((accessToken) => {
              //TODO: handle error: user may have denied permissions
              return ctx.facebookService.getProfile(accessToken);
            });
        });
      },
  },
  User: {
    name(root, args, ctx) {
      return root.profile.name;
    },
    picture(root, args, ctx) {
      if ( !root.profile.pictureId ) {
        return { _id: null };
      }

      return { _id: root.profile.pictureId };
    },
  },
  Message: {
    chat(root, args, ctx) {
      return ctx.Chats.findOne(root.chatId);
    },
    sender(root, args, ctx) {
      return ctx.Users.findOne(root.senderId);
    },
    type(root, args, ctx) {
      return root.type.toUpperCase();
    },
    ownership(root, args, ctx) {
      return this.userId$.map((userId) => root.senderId === userId);
    }
  },
  Chat: {
    lastMessage(root, args, ctx) {
      const selector = {
        chatId: root._id,
      };
      let search = ctx.Messages.find(selector, {
        sort: { createdAt: -1 },
        limit: 1
      })
      .debounceTime(25)
      .map((v) => v.length ? v[0] : null);

      return search;
    },
    messageCount(root, args, ctx) {
      return ctx.Messages.collection.find({
        chatId: root._id,
      }).count();
    },
    messages(root, args, ctx) {
      const selector = {
        chatId: root._id,
      };

      let search = ctx.Messages.find(selector, {
        sort: { createdAt: -1 },
        ...(args.limit ? { limit: args.limit } : {}),
      }).debounceTime(10);

      let totalMessages = ctx.Messages.collection.find(selector).count();
      if ( args.limit ) {
        totalMessages = Math.min(totalMessages, args.limit);
      }

      return search
      // Delay results until enough arrived.
      .switchMap((messages) => {
        if ( messages.length < totalMessages ) {
          // Do not emit yet.
          return Observable.empty();
        }

        return Observable.of(messages);
      })
      .map((messages) => {
        const format = 'D MMMM Y';

        // Group by creation day
        const groupedMessages = _.groupBy(messages, (message) => {
          return moment(message.createdAt).format(format);
        });

        // Transform dictionary into an array
        return Object.keys(groupedMessages).map((timestamp: string) => {
          return {
            timestamp: timestamp,
            messages: groupedMessages[timestamp].reverse(),
            today: moment().format(format) === timestamp
          };
        }).reverse();
      });
    },
    members(root, args, ctx) {
      return ctx.Users.find({
        _id: { $in: root.memberIds }
      }, {
        fields: { profile: 1 }
      });
    },
    title(root, args, ctx) {
      return this.userId$.map((userId) => {
        const receiverId = root.memberIds.find(memberId => memberId !== userId);
        const receiver = ctx.Users.findOne(receiverId);
        return (receiver && receiver.profile.name) || '';
      });
    },
    picture(root, args, ctx) {
      return this.userId$.map((userId) => {
        const receiverId = root.memberIds.find(memberId => memberId !== userId);
        const receiver = ctx.Users.findOne(receiverId);

        if ( !receiver || !receiver.profile.pictureId ) {
          return { _id: null };
        }

        return { _id: receiver.profile.pictureId };
      });
    },
  },
  Picture: {
    url(root, args, ctx) {
      let platform;

      if ( !args.platform || args.platform === 'WEB' ) {
        platform = '';
      } else {
        platform = args.platform.toLowerCase();
      }

      return ctx.Pictures.getPictureUrl(root._id, platform);
    },
  },
};

export const schema = makeExecutableSchema({ typeDefs, resolvers });
