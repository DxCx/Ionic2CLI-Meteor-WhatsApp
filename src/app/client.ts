import ApolloClient from 'apollo-client';
import Link from 'apollo-link-ws';
import { default as InMemoryCache, NormalizedCache } from 'apollo-cache-inmemory'
import { getNetworkInterface } from 'meteor-graphql-rxjs';

let client: ApolloClient<NormalizedCache>;

export function provideClient(): ApolloClient<NormalizedCache> {
  if ( !client ) {
    client = new ApolloClient<NormalizedCache>({
      link: new Link(getNetworkInterface()),
      cache: new InMemoryCache().restore(window['__APOLLO_STATE__'] || {}),
    });
  }

  return client;
}
