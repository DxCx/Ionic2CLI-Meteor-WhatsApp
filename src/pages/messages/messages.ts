import { Component, OnInit, OnDestroy, ElementRef } from '@angular/core';
import { NavParams, PopoverController, ModalController } from 'ionic-angular';
import { Chat, MessageType, Location } from 'api/models';
import { _ } from 'meteor/underscore';
import { MessagesOptionsComponent } from './messages-options';
import { Subscription, Observable } from 'rxjs';
import { MessagesAttachmentsComponent } from './messages-attachments';
import { PictureService } from '../../services/picture';
import { ShowPictureComponent } from './show-picture';

import gql from 'graphql-tag';

import { Apollo } from 'apollo-angular';

@Component({
  selector: 'messages-page',
  templateUrl: 'messages.html'
})
export class MessagesPage implements OnInit, OnDestroy {
  selectedChat: Chat;
  title: string;
  picture: string;
  autoScroller: MutationObserver;
  scrollOffset = 0;
  messagesDayGroups: Observable<any[]>;
  message: string = '';

  constructor(
    navParams: NavParams,
    private el: ElementRef,
    private popoverCtrl: PopoverController,
    private pictureService: PictureService,
    private modalCtrl: ModalController,
    private client: Apollo) {

    this.selectedChat = <Chat>navParams.get('chat');
    this.title = this.selectedChat.title;
    this.picture = this.selectedChat.picture.url;
  }

  private get messagesPageContent(): Element {
    return this.el.nativeElement.querySelector('.messages-page-content');
  }

  private get messagesList(): Element {
    return this.messagesPageContent.querySelector('.messages');
  }

  private get scroller(): Element {
    return this.messagesList.querySelector('.scroll-content');
  }

  ngOnInit() {
    this.autoScroller = this.autoScroll();

    const liveResults = this.client.watchQuery<{ chat: { messages: any[] } }>({
      query: gql`query chatMessages($chatId: ID!) {
        chat(_id: $chatId) {
          messages(limit: 10) @live {
            timestamp
            today
            messages {
              _id
              createdAt
              type
              content
              ownership
            }
          }
        }
      }`,
      variables: {
        chatId: this.selectedChat._id,
      },
    })
    .map((v) => v.data && v.data.chat && v.data.chat.messages);

    const historyResults = this.client.watchQuery<{ chat: { messages: any[] } }>({
      query: gql`query chatMessages($chatId: ID!) {
        chat(_id: $chatId) {
          messages @defer {
            timestamp
            today
            messages {
              _id
              createdAt
              type
              content
              ownership
            }
          }
        }
      }`,
      variables: {
        chatId: this.selectedChat._id,
      },
    })
    .map((v) => (v.data && v.data.chat && v.data.chat.messages) || null);

    const copyDay = (d) => ({
      ...d,
      messages: d.messages.map((v) => ({ ...v })),
    });

    this.messagesDayGroups = Observable.combineLatest(
      liveResults,
      historyResults,
    ).scan((state, [live, hist]) => {
      if ( null === live ) {
        return state;
      }

      // until history arrives, we want to show live result.
      if ( null === hist ) {
        return {
          historyTaken: false,
          messages: live,
        };
      }

      // is history arrived for the first time? override state with it.
      const msgs = (state.historyTaken ? state.messages : hist.map((d) => copyDay(d)));

      // and finally merge live into it.
      live.forEach((msgByDay) => {
        const day = _.find(msgs, (histDay) => histDay.timestamp === msgByDay.timestamp);
        if ( !day ) {
          msgs.push(copyDay(msgByDay));
          return;
        }

        day.today = msgByDay.today;
        msgByDay.messages.forEach((msg) => {
          const hasMsg = _.find(day.messages, (histMsg) => histMsg._id === msg._id);
          if ( hasMsg ) {
            return;
          }

          day.messages.push(msg);
        });
      });

      return {
        historyTaken: true,
        messages: msgs,
      };
    }, {
      historyTaken: false,
      messages: [],
    })
    .map((v) => v.messages);
  }

  ngOnDestroy() {
    this.autoScroller.disconnect();
  }

  autoScroll(): MutationObserver {
    const autoScroller = new MutationObserver(this.scrollDown.bind(this));

    autoScroller.observe(this.messagesList, {
      childList: true,
      subtree: true
    });

    return autoScroller;
  }

  scrollDown(): void {
    // Scroll down and apply specified offset
    this.scroller.scrollTop = this.scroller.scrollHeight - this.scrollOffset;

    // Zero offset for next invocation
    this.scrollOffset = 0;
  }

  showOptions(): void {
    const popover = this.popoverCtrl.create(MessagesOptionsComponent, {
      chat: this.selectedChat
    }, {
      cssClass: 'options-popover messages-options-popover'
    });

    popover.present();
  }

  onInputKeypress({ keyCode }: KeyboardEvent): void {
    if (keyCode === 13) {
      this.sendTextMessage();
    }
  }

  sendTextMessage(): void {
    // If message was yet to be typed, abort
    if (!this.message) {
      return;
    }

    this.addMessage(MessageType.TEXT, this.message).subscribe(undefined, undefined, () => {
      // Zero the input field
      this.message = '';
    });
  }

  sendLocationMessage(location: Location): void {
    this.addMessage(MessageType.LOCATION,
      `${location.lat},${location.lng},${location.zoom}`).subscribe();
  }

  showAttachments(): void {
    const popover = this.popoverCtrl.create(MessagesAttachmentsComponent, {
      chat: this.selectedChat
    }, {
      cssClass: 'attachments-popover'
    });

    popover.onDidDismiss((params) => {
      if (params) {
        if (params.messageType === MessageType.LOCATION) {
          const location = params.selectedLocation;
          this.sendLocationMessage(location);
        }
        else if (params.messageType === MessageType.PICTURE) {
          const blob: File = params.selectedPicture;
          this.sendPictureMessage(blob);
        }
      }
    });

    popover.present();
  }

  sendPictureMessage(blob: File): void {
    this.pictureService.upload(blob).then((picture) => {
      this.addMessage(MessageType.PICTURE, picture.url)
        .subscribe();
    });
  }

  getLocation(locationString: string): Location {
    const splitted = locationString.split(',').map(Number);

    return <Location>{
      lat: splitted[0],
      lng: splitted[1],
      zoom: Math.min(splitted[2] || 0, 19)
    };
  }

  showPicture({ target }: Event) {
    const modal = this.modalCtrl.create(ShowPictureComponent, {
      pictureSrc: (<HTMLImageElement>target).src
    });

    modal.present();
  }

  private addMessage(messageType: MessageType, content: string) {
    let gqlType;
    switch( messageType ) {
      case MessageType.PICTURE:
        gqlType = "PICTURE";
        break;
      case MessageType.LOCATION:
        gqlType = "LOCATION";
        break;
      case MessageType.TEXT:
        gqlType = "TEXT";
        break;
      default:
        throw new Error('Invalid message type');
    }

    return this.client.mutate<boolean>({
      mutation: gql`mutation addMessage($chatId: ID!, $type: MessageType!, $content: String!) {
        addMessage(type: $type, content: $content, chatId: $chatId)
      }`,
      variables: {
        chatId: this.selectedChat._id,
        content: content,
        type: gqlType,
      }
    });
  }
}
