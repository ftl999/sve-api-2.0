import {SVEAccount, SVEGroup, SVEToken, Token, TokenType} from 'svebaselib';
import mongoose from 'mongoose';
import { SVEServerSystemInfo } from './SVEServerSystemInfo';

const tokenSchema = new mongoose.Schema({
    token: String,
    type: Number,
    time: Date,
    target: Number
});
const TokenModel = mongoose.model('Token', tokenSchema);

export class SVEServerToken extends SVEToken {
    public static register(type: TokenType, target: SVEAccount | SVEGroup): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            if (SVEServerSystemInfo.getSystemStatus().tokenSystem) {
                let token = [...Array(30)].map(i=>(~~(Math.random()*36)).toString(36)).join('');
                let t = new TokenModel({
                    token: token,
                    type: Number(type),
                    target: target.getID(),
                    time: new Date()
                });
                t.save((err, tk) => {
                    if (err) {
                        console.log("MONGOOSE SAVE ERROR:" + JSON.stringify(err));
                        reject();
                    } else {
                        resolve(token);
                    }
                });
            } else {
                reject();
            }
        });
    }

    public static tokenExists(type: TokenType, token: string, targetID: number): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            let search: any = undefined;
            if (isNaN(targetID)) {
                search = {token: token, type: Number(type)};
            } else {
                search = {token: token, type: Number(type), target: targetID};
            }
            TokenModel.find(search, (err, tokens) => {
                if(err) {
                    console.log("MONGOOSE FIND ERROR:" + JSON.stringify(err));
                    reject();
                } else {
                    let found = false;
                    tokens.forEach(tk => {
                        let time = new Date(Number((tk as any).time));
                        time.setDate((tk as any).time.getDate() + 7);
                        if (time > new Date()) {
                            found = true;
                        } else {
                            tk.remove();
                        }
                    });

                    resolve(found);
                }
            });
        });
    }

    public static use(type: TokenType, token: string, targetID: number): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            TokenModel.findOne({token: token, type: Number(type), target: targetID}, (err, tokens) => {
                if(err) {
                    console.log("MONGOOSE USE ERROR:" + JSON.stringify(err));
                    reject();
                } else {
                    resolve(true);
                }
            });
        });
    }

    public static remove(type: TokenType, token: string, targetID: number): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            TokenModel.findOneAndRemove({token: token, type: Number(type), target: targetID}, (err, tokens) => {
                if(err) {
                    console.log("MONGOOSE REMOVE ERROR:" + JSON.stringify(err));
                    reject();
                } else {
                    resolve(true);
                }
            });
        });
    }
}

export {
    TokenModel
};