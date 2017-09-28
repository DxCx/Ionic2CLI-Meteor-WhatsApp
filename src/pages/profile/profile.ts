import { Component, OnInit } from '@angular/core';
import { Profile } from 'api/models';
import { AlertController, ViewController, NavController, Platform } from 'ionic-angular';
import { ChatsPage } from '../chats/chats';
import { PictureService } from '../../services/picture';
import { Subject, Observable } from 'rxjs';
import gql from 'graphql-tag';

import { Apollo } from 'apollo-angular';

interface GQLUser {
  name: string;
  picture: {
    _id: string;
    url: string;
  };
}

@Component({
  selector: 'profile',
  templateUrl: 'profile.html'
})
export class ProfilePage implements OnInit {
  lastPicId: string;
  picture$: Subject<string>;
  picture: Observable<string>;
  me: Observable<GQLUser>;
  inputName: string;

  constructor(
    private alertCtrl: AlertController,
    private navCtrl: NavController,
    private viewCtrl: ViewController,
    private pictureService: PictureService,
    private platform: Platform,
    private client: Apollo) {
  }

  ngOnInit(): void {
    this.lastPicId = null;
    this.inputName = '';

    let platform = this.platform.is('android') ? "ANDROID" :
      this.platform.is('ios') ? "IOS" : "WEB";
    platform = this.platform.is('cordova') ? platform : "WEB";


    this.me = this.client.watchQuery<{ me: GQLUser }>({
      query: gql`query profile($platform: PlatformType!) {
        me {
          name
          picture {
            _id
            url(platform: $platform)
          }
        }
      }`,
      variables: {
        platform,
      },
    })
    .map((v) => v.data.me)
    .do((v) => {
      // TODO: Abit Hacky need a better solution
      this.lastPicId = v.picture._id;
      this.inputName = v.name;
    })
    .publishReplay(1)
    .refCount();

    this.picture$ = new Subject<string>();
    this.picture = this.me.map((v) => v.picture.url)
      .concat(this.picture$);
  }

  selectProfilePicture(): void {
    this.pictureService.getPicture(false, true).then((blob) => {
      this.uploadProfilePicture(blob);
    })
      .catch((e) => {
        this.handleError(e);
      });
  }

  uploadProfilePicture(blob: File): void {
    this.pictureService.upload(blob).then((picture) => {
      this.lastPicId = picture._id;
      this.picture$.next(picture.url);
    })
      .catch((e) => {
        this.handleError(e);
      });
  }

  updateProfile(): void {
    this._updateProfile({
      name: this.inputName,
      pictureId: this.lastPicId,
    }).subscribe({
      complete: () => {
        this.viewCtrl.dismiss().then(() =>
          this.navCtrl.setRoot(ChatsPage, {})
        );
      },
      error: (e: Error) => {
        this.handleError(e);
      }
    });
  }

  handleError(e: Error): void {
    console.error(e);

    const alert = this.alertCtrl.create({
      title: 'Oops!',
      message: e.message,
      buttons: ['OK']
    });

    alert.present();
  }

  private _updateProfile(profile: Profile) {
    return this.client.mutate<boolean>({
      mutation: gql`mutation update($profile: InputProfile!){
        updateProfile(profile: $profile)
      }`,
      variables: {
        profile,
      }
    });
  }
}
