import { Component } from "@angular/core";
import { Alert, AlertController, NavController } from "ionic-angular";
import { PhoneService } from "../../services/phone";
import { ProfilePage } from "../profile/profile";
import { FbProfile } from "api/services/facebook";
import { Profile } from "api/models";
import { Observable } from 'rxjs';
import gql from 'graphql-tag';

import { Apollo } from 'apollo-angular';

@Component({
  selector: 'facebook',
  templateUrl: 'facebook.html'
})
export class FacebookPage {

  constructor(private alertCtrl: AlertController,
              private phoneService: PhoneService,
              private navCtrl: NavController,
              private client: Apollo) {
  }

  cancel(): void {
    const alert: Alert = this.alertCtrl.create({
      title: 'Confirm',
      message: `Would you like to proceed without linking your account with Facebook?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Yes',
          handler: () => {
            this.dontLink(alert);
            return false;
          }
        }
      ]
    });

    alert.present();
  }

  linkFacebook(): void {
    Observable.fromPromise(
      this.phoneService.linkFacebook()
    )
    .flatMap(() => this.client.query<{
      myFacebookProfile: FbProfile,
    }>({
        query: gql`query FBProfile {
          myFacebookProfile {
            name
            pictureUrl
          }
        }`,
      })
    )
    .map((v) => v.data.myFacebookProfile)
    .switchMap((fbProfile: FbProfile) => {
      const pathname = (new URL(fbProfile.pictureUrl)).pathname;
      const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
      const description = {name: filename};
      const p = new Promise((resolve, reject) => {
        Meteor.call('ufsImportURL', fbProfile.pictureUrl, description, 'pictures', (e, v) => {
          if ( e ) {
            return reject(e);
          }

          return resolve(v);
        });
      });

      return Observable.fromPromise(p)
      .map((value) => ({
        name: fbProfile.name,
        pictureId: (<any>value)._id,
      }))
      .switchMap((profile) => this.updateProfile(profile));
    })
    .subscribe({
      complete: () => {
        this.navCtrl.setRoot(ProfilePage, {}, {
          animate: true
        });
      },
      error: (e: Error) => {
        this.handleError(e);
      }
    });
  }

  dontLink(alert: Alert): void {
    alert.dismiss()
      .then(() => {
        this.navCtrl.setRoot(ProfilePage, {}, {
          animate: true
        });
      })
      .catch((e) => {
        this.handleError(e);
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

  private updateProfile(profile: Profile) {
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
