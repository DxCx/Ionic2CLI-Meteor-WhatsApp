import { Component, OnInit } from '@angular/core';
import { User } from 'api/models';
import { AlertController, Platform, ViewController } from 'ionic-angular';
import { Observable, BehaviorSubject } from 'rxjs';
import { PhoneService } from "../../services/phone";

import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';

@Component({
  selector: 'new-chat',
  templateUrl: 'new-chat.html'
})
export class NewChatComponent implements OnInit {
  searchPattern: BehaviorSubject<any>;
  users: Observable<User[]>;
  contacts: string[] = [];
  contactsPromise: Promise<void>;

  constructor(
    private alertCtrl: AlertController,
    private viewCtrl: ViewController,
    private platform: Platform,
    private phoneService: PhoneService,
    private client: Apollo,
  ) {
    this.searchPattern = new BehaviorSubject(undefined);
  }

  ngOnInit() {
    let platformParam = this.platform.is('android') ? "ANDROID" :
      this.platform.is('ios') ? "IOS" : "WEB";
    platformParam = this.platform.is('cordova') ? platformParam : "WEB";

    this.contactsPromise = this.phoneService.getContactsFromAddressbook()
      .then((phoneNumbers: string[]) => {
        this.contacts = phoneNumbers;
      })
      .catch((e: Error) => {
        console.error(e.message);
      });

    this.users = this.observeSearchBar()
      .withLatestFrom(this.contactsPromise)
      .switchMap(([searchPattern, phoneBook]) => this.client.watchQuery<{
        contacts: User[]
      }>({
        query: gql`query contacts(
          $platform: PlatformType = WEB,
          $searchPattern: String,
          $phoneBook: [String!] = []) {
            contacts(searchPattern: $searchPattern, phoneBook: $phoneBook) {
              _id
              name
              picture {
                url(platform: $platform)
              }
            }
        }`,
        variables: {
          platform: platformParam,
          searchPattern,
          phoneBook,
        },
      })
      .map((v) => v.data.contacts)
      // Invoke map with an empty array in case no user found
      .startWith([])
      );
  }

  updateSubscription(newValue) {
    this.searchPattern.next(newValue);
  }

  observeSearchBar(): Observable<string> {
    return this.searchPattern.asObservable()
      .debounce(() => Observable.timer(1000));
  }

  addChat(user: User): void {
    this.client.mutate<boolean>({
      mutation: gql`mutation addChat($userId: ID!) {
        addChat(receiverId: $userId)
      }`,
      variables: {
        userId: user._id,
      }
    }).subscribe({
      next: () => {
        this.viewCtrl.dismiss();
      },
      error: (e: Error) => {
        this.viewCtrl.dismiss().then(() => {
          this.handleError(e);
        });
      }
    });
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
}
