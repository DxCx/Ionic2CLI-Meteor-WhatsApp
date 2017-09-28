import { Component, OnInit } from '@angular/core';
import { Chat } from 'api/models';
import { NavController, PopoverController, ModalController, AlertController, Platform } from 'ionic-angular';
import { Observable } from 'rxjs';
import { MessagesPage } from '../messages/messages';
import { ChatsOptionsComponent } from './chats-options';
import { NewChatComponent } from './new-chat';
import { FCM } from "@ionic-native/fcm";
import gql from 'graphql-tag';

import { Apollo } from 'apollo-angular';

@Component({
  templateUrl: 'chats.html'
})
export class ChatsPage implements OnInit {
  chats: Observable<Chat[]>;

  constructor(
    private navCtrl: NavController,
    private popoverCtrl: PopoverController,
    private modalCtrl: ModalController,
    private alertCtrl: AlertController,
    private platform: Platform,
    private fcm: FCM,
    private client: Apollo) {
  }

  ngOnInit() {
    let platformParam = this.platform.is('android') ? "ANDROID" :
      this.platform.is('ios') ? "IOS" : "WEB";
    platformParam = this.platform.is('cordova') ? platformParam : "WEB";

    this.chats = this.client.watchQuery<{ allChats: Chat[] }>({
      query: gql`query chats($platform: PlatformType) {
        allChats @live {
          _id
          title
          picture {
            url(platform: $platform)
          }
          lastMessage @defer @live {
            type
            content
          }
        }
      }`,
      variables: {
        platform: platformParam,
      },
    }).map((v) => (v.data && v.data.allChats) || []);

    // Notifications
    if (this.platform.is('cordova')) {
      this.fcm.getToken().then(token => {
        console.log("Registering FCM token on backend");
        this.saveFcmToken(token);
      });

      this.fcm.onNotification().subscribe(data => {
        if (data.wasTapped) {
          console.log("Received FCM notification in background");
        } else {
          console.log("Received FCM notification in foreground");
        }
      });

      this.fcm.onTokenRefresh().subscribe(token => {
        console.log("Updating FCM token on backend");
        this.saveFcmToken(token);
      });
    }
  }

  addChat(): void {
    const modal = this.modalCtrl.create(NewChatComponent);
    modal.present();
  }

  showMessages(chat): void {
    this.navCtrl.push(MessagesPage, {chat});
  }

  handleError(e: Error): void {
    console.error(e);

    const alert = this.alertCtrl.create({
      buttons: ['OK'],
      message: e.message,
      title: 'Oops!'
    });

    alert.present();
  }

  showOptions(): void {
    const popover = this.popoverCtrl.create(ChatsOptionsComponent, {}, {
      cssClass: 'options-popover chats-options-popover'
    });

    popover.present();
  }

  removeChat(chat: Chat): void {
    this.client.mutate<boolean>({
      mutation: gql`mutation removeChat($chatId: ID!) {
        removeChat(chatId: $chatId)
      }`,
      variables: {
        chatId: chat._id,
      }
    }).subscribe({
      error: (e: Error) => {
        if (e) {
          this.handleError(e);
        }
      },
    });
  }

  private saveFcmToken(token: string) {
    this.client.mutate<boolean>({
      mutation: gql`mutation saveFcmToken($token: String!) {
        saveFcmToken(token: $token)
      }`,
      variables: {
        token,
      }
    }).subscribe({
      next: () => console.log("FCM Token saved"),
      error: err => console.error('Impossible to save FCM token: ', err)
    });
  }
}
