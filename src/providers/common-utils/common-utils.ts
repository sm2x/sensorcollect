import { Injectable } from '@angular/core';
import { ToastController, LoadingController, AlertController } from 'ionic-angular';
import { File } from '@ionic-native/file';
import { Observable } from 'rxjs/Rx';
import * as moment from 'moment';
import { AngularFireDatabaseModule, AngularFireDatabase, FirebaseListObservable } from 'angularfire2/database';
import * as firebase from 'firebase/app';
import 'firebase/storage';
import { Storage } from '@ionic/storage';
import { AppVersion } from '@ionic-native/app-version';
import { Platform } from 'ionic-angular';
import { Http } from '@angular/http';
import 'rxjs/add/operator/map';

// TBD: firebase stuff is here too - need to move it out to its own service

@Injectable()
export class CommonUtilsProvider {

  loader: any;
  logFile: string = 'triplog.txt';
  timer: any;
  user: { email: string, password: string } = { email: '', password: '' };
  version: string = "undefined";


  constructor(public toastCtrl: ToastController, public loadingCtrl: LoadingController, public file: File, public db: AngularFireDatabase, public storage: Storage, public alert: AlertController, public appVersion: AppVersion, public plt: Platform, public http:Http) {

    plt.ready().then(() => {
      this.appVersion.getVersionNumber()
        .then(ver => { this.version = ver; console.log("version=" + ver) });

    })

    storage.ready().then(() => {
      console.log("Storage engine is:" + storage.driver)
    })
  }

  getRemoteVersion(): Promise <any> {


    let url = "https://firebasestorage.googleapis.com/v0/b/tripdata-3eb84.appspot.com/o/version%2Fversion.txt?alt=media&token=2fc6d9a5-4423-4b10-b334-70857615d4ba";
    return new Promise((resolve, reject) => {
        this.http.get(url).map(res=>res).subscribe(data => {
            let ver = data["_body"];
            console.log ("Latest app version:"+ver);
            resolve(ver);
        },
          err => {console.log ("Latest App version error:"+JSON.stringify(err)); reject(err);}
        
      );
    });
  }

  // returns app version
  getVersion(): string {
    return this.version;
  }
  // pass -1 to dur for infinite
  presentLoader(text, dur = 6000, remove = true) {

    if (this.loader && remove) { this.loader.dismiss(); }
    this.loader = this.loadingCtrl.create({
      content: text,
      duration: dur
    });
    this.loader.present();
  }

  removerLoader() {
    if (this.loader) { this.loader.dismiss(); }
  }

  // wrapper to present a toast with different colors
  // error = red
  // any other val = green
  presentToast(text, type?, dur?) {

    var cssClass = 'successToast';
    if (type == 'error') cssClass = 'errorToast';

    let toast = this.toastCtrl.create({
      message: text,
      duration: dur || 1800,
      position: 'top',
      cssClass: cssClass
    });
    toast.present();
  }

  // create an empty log file on start if needed
  init() {

    this.getRemoteVersion();
    this.file.checkFile(this.file.dataDirectory, this.logFile)
      .then(succ => { console.log("log file exists"); })
      .catch(_ => { console.log("**CREATING LOG"); this.file.createFile(this.file.dataDirectory, this.logFile, true) });

      this.getPendingUpload()
      .then (succ=> {
        if (succ == undefined)
          {
            console.log ("CLEARING PENDING");
            this.setPendingUpload(false);
          }

      })

      
  }

  // write a text string to the logs - used for headers
  writeString(str) {
    console.log(this.file.dataDirectory + " " + this.logFile + " " + str);
    return this.file.writeFile(this.file.dataDirectory, this.logFile, str, { replace: false, append: true });
  }

  // dump a fragment of logs to a file
  writeLog(logs_object) {
    // don't JSON stringify full array as these are chunks

    let str = "";
    for (let i = 0; i < logs_object.length; i++) {
      str = str + "              " + JSON.stringify(logs_object[i]) + "," + "\n";
    }

    return this.file.writeFile(this.file.dataDirectory, this.logFile, str, { replace: false, append: true });

  }

  logFileLocation() {
    return this.file.dataDirectory + this.logFile;
  }

  deleteLog() {
    return this.file.writeFile(this.file.dataDirectory, "triplog.txt", "", { replace: true });
  }

  // start a trip timer
  startTimer(timer) {
    this.timer = Observable.interval(1000)
      .subscribe(x => { timer.time = "(" + moment.utc(x * 1000).format("HH:mm:ss") + ")"; });
  }


  // stop trip timer
  stopTimer(timer) {
    this.timer.unsubscribe();
    timer.time = "";
  }

  // if the app user has not provided credentials for firebase DB, this will ask
  // for it. 
  promptForPassword(): Promise<any> {
    return new Promise((resolve, reject) => {
      let alert = this.alert.create({
        title: 'Database authorization',
        message: 'Please enter database password',
        inputs: [{
          name: 'email',
          value: 'mltrainer@hsc.com',
          type: 'email'
        },
        {
          name: 'password',
          placeholder: 'Password',
          type: 'password'
        }
        ],
        buttons: [
          {
            text: 'Cancel',
            role: 'cancel',
            handler: data => { reject(data) }
          },

          {
            text: 'Ok',
            handler: data => {
              console.log("Saving " + JSON.stringify(data));
              this.storage.set('user', data);
              resolve(data);

            }
          },

        ],
      });
      alert.present();
    });
  }

  // called if credentials are wrong, so user is prompted again
  clearUser() {
    console.log("clearing user");
    this.storage.remove('user')
      .catch(e => { console.log("user clear error:" + JSON.stringify(e)) });
  }

  getUser(): Promise<any> {
    return this.storage.get('user');
  }

  setPendingUpload(status,name=""): Promise <any> {
    console.log ("Pending called with "+status+" " + name);
    return this.storage.set ('pendingUpload', {status:status, name:name})
  }

  getPendingUpload(): Promise <any> {
    return this.storage.get ('pendingUpload')    
  }

  getCachedUser() {
    return this.user;
  }

  doAuthWithPrompt(): Promise<any> {
    return this.getUser()
      .then(user => {
        console.log("Got user:" + JSON.stringify(user));
        if (user == undefined || !user.email || !user.password) {
          return this.promptForPassword()
            .then(data => {
              return this.doAuth(data.email, data.password);
            })
        }
        else {
          return this.doAuth(user.email, user.password)
        };

      })
      .catch(e => { return Promise.reject(false); })

  }

  doAuth(u, p): Promise<any> {
    return new Promise((resolve, reject) => {
      console.log(`Inside doAuth with ${u}:${p}`);
      this.user.email = u;
      this.user.password = p;
      firebase.auth().signInWithEmailAndPassword(u, p)
        .then(succ => {
          console.log("**** Signed in");
          resolve(succ);
        })
        .catch(error => {
          console.log("Auth Error:" + JSON.stringify(error));
          this.presentToast(error["code"], "error");
          this.clearUser();
          reject(error);
        })

    })

  }

  // upload trip data to firebase. called by doAuth
  // after all auth validation is done
  uploadDataToFirebase(name, prg): Promise <any> {

    return new Promise((resolve, reject) => {

    console.log("cloud upload called for " + name);
    //this.presentLoader("loading...");
    let storageRef = firebase.storage().ref();
    console.log("storage ref is " + storageRef);
    return this.file.readAsArrayBuffer(this.file.dataDirectory, this.logFile)
      .then(succ => {
        console.log("File read");
        console.log(succ);
        let blob = new Blob([succ], { type: "text/plain" });
        console.log("Blob  created");
        let uploadUrl = storageRef.child(`tripdata/${name}.txt`);
        let uploadTask = uploadUrl.put(blob);
        uploadTask.on(firebase.storage.TaskEvent.STATE_CHANGED,
          (snapshot) => {
            let progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            if (prg) prg.val = progress;
          },
          (error) => {
            console.log("Firebase put error " + JSON.stringify(error));
            setTimeout(() => { prg.val = -1; }, 500);
            this.presentToast("upload error", "error")
            reject (error)
          },
          () => { // over
            prg.val = 100;
            setTimeout(() => { prg.val = -1; }, 500);
            // write download URL to realtime DB so we can iter it later
            // there is no API in storage today to iterate
            let downloadURL = uploadTask.snapshot.downloadURL;
            console.log("Download url is " + downloadURL);
            //let key = 'tripDataIndex/'+name;
            //console.log ("key="+key);
            firebase.database().ref('tripDataIndex/').push()
              .set({
                'url': downloadURL,
                'uploadedon': Date(),
                'uploadedby': this.user.email,
                'name': name,
                'version': this.getVersion(),
                'storageRef': `tripdata/${name}.txt`
              })
              .then (succ=>{this.presentToast("upload complete");resolve(succ)})
              .catch(err => { console.log("ERROR " + err); this.presentToast("error creating index", "error"); reject (err) })
            
          }
        )
      })
      .catch(err => { console.log("Cordova Read Error " + err); reject (err) })
    }) // new promise
  }
  
}