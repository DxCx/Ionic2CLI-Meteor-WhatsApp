const query = `query chats {
  allChats {
    members {
      name
    }
    lastMessage @live {
      content
      type
    }
  }
}

query me {
  me {
    name
    picture {
      url
    }
  }
}`;

export default query;
