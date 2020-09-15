import ServerHelper from './serverhelper';
import {BasicUserInitializer, SVEGroup as SVEBaseGroup, LoginState, SVEDataType, SessionUserInitializer, SVESystemState, SVEAccount as SVEBaseAccount, SVEDataInitializer, SVEDataVersion} from 'svebaselib';
import {SVEServerAccount as SVEAccount} from './serverBaseLib/SVEServerAccount';

import {SVEServerSystemInfo as SVESystemInfo} from './serverBaseLib/SVEServerSystemInfo';
import {SVEServerData as SVEData} from './serverBaseLib/SVEServerData';
import {SVEServerGroup as SVEGroup} from './serverBaseLib/SVEServerGroup';
import {SVEServerProject as SVEProject} from './serverBaseLib/SVEServerProject';
import {apiVersion as authVersion} from './authenticator';

import { Request, Response, Router } from "express";

import * as fs from "fs";

import {Ranges} from "range-parser";

import * as formidable from "formidable";
import {Fields, File, Files, Part, } from "formidable";
import HugeUploader from 'huge-uploader-nodejs';
import { copyFile, mkdir } from 'fs';
import { dirname } from 'path';

const tmpDir = './tmp';
mkdir(tmpDir, (err) => {});
var router = Router();
var resumable = require("resumable");
const apiVersion = 1.0;

ServerHelper.setupRouter(router);

interface APIVersion {
    fileAPI: Number;
    authAPI: Number;
}

interface APIStatus {
    status: SVESystemState,
    version: APIVersion,
    loggedInAs?: SessionUserInitializer
}

router.get('/check', function (req: Request, res: Response) {
    let status: APIStatus = {
        status: SVESystemInfo.getSystemStatus(),
        version: {
            fileAPI: apiVersion,
            authAPI: authVersion
        } 
    };

    if (req.session!.user) {
        new SVEAccount(req.session!.user as SessionUserInitializer, (user: SVEBaseAccount) => {
            status.loggedInAs = {
                id: user.getID(),
                loginState: user.getLoginState(),
                name: user.getName(),
                sessionID: ""
            };
            res.json(status);
        });
    } else {
        res.json(status);
    }
});

router.get('/groups', function (req: Request, res: Response) {
    if (req.session!.user) {
        SVEGroup.getGroupsOf(new SVEAccount(req.session!.user as SessionUserInitializer)).then((val: SVEBaseGroup[]) => {
            let list: number[] = [];
            val.forEach((g: SVEBaseGroup) => list.push(g.getID()));
            res.json(list);
        }, (err: any) => {
            res.json(err);
        })
    } else {
        res.sendStatus(401);
    }
});

router.get('/group/:id/rights', function (req: Request, res: Response) {
    if (req.session!.user) {
        let idx = Number(req.params.id);
        new SVEAccount(req.session!.user as SessionUserInitializer, (user: SVEBaseAccount) => {
            new SVEGroup(idx, new SVEAccount(req.session!.user as SessionUserInitializer), (group?: SVEBaseGroup) => {
                if(group !== undefined && group.getID() != NaN) {
                    group.getRightsForUser(user).then((rights) => {
                        res.json(rights);
                    });
                } else {
                    res.sendStatus(404);
                }
            });
        });
    } else {
        res.sendStatus(401);
    }
});

router.get('/group/:id/users', function (req: Request, res: Response) {
    if (req.session!.user) {
        let idx = Number(req.params.id);
        new SVEAccount(req.session!.user as SessionUserInitializer, (user: SVEBaseAccount) => {
            new SVEGroup(idx, new SVEAccount(req.session!.user as SessionUserInitializer), (group?: SVEBaseGroup) => {
                if(group !== undefined && group.getID() != NaN) {
                    group.getRightsForUser(user).then((rights) => {
                        if(rights.read) {
                            group.getUsers().then(usrs => {
                                res.json(usrs);
                            }, err => res.sendStatus(500));
                        } else {
                            res.sendStatus(401);
                        }
                    });
                } else {
                    res.sendStatus(404);
                }
            });
        });
    } else {
        res.sendStatus(401);
    }
});

router.get('/group/:id', function (req: Request, res: Response) {
    if (req.session!.user) {
        let idx = Number(req.params.id);
        new SVEAccount(req.session!.user as SessionUserInitializer, (user: SVEBaseAccount) => {
            new SVEGroup(idx, new SVEAccount(req.session!.user as SessionUserInitializer), (group?: SVEBaseGroup) => {
                if(group !== undefined && group.getID() != NaN) {
                    group.getRightsForUser(user).then((rights) => {
                        if(rights.read) {
                            group.getProjects().then((prjs) => {
                                let list: number[] = [];
                                prjs.forEach(p => list.push(p.getID()));
                                res.json({
                                    group: {
                                        id: group.getID(),
                                        name: group.getName()
                                    },
                                    projects: list
                                });
                            }, (err) => {
                                res.json({
                                    group: group,
                                    projects: [],
                                    err: err
                                });
                            });
                        } else {
                            res.sendStatus(401);
                        }
                    }, err => res.sendStatus(500));
                } else {
                    res.sendStatus(404);
                }
            });
        });
    } else {
        res.sendStatus(401);
    }
});

router.put('/project/:prj(\\d+|new)', function (req: Request, res: Response) {
    res.sendStatus(401);
});

router.delete('/project/:prj(\\d+)', function (req: Request, res: Response) {
    if (req.session!.user) {
        let idx: number = Number(req.params.id);
        new SVEAccount(req.session!.user as SessionUserInitializer, (user) => {
            new SVEProject(idx as number, user, (self) => {
                self.remove().then(success => {
                    if(success) {
                        res.sendStatus(200);
                    } else {
                        res.sendStatus(401);
                    }
                }, err => res.sendStatus(500));
            });
        });
    } else {
        res.sendStatus(401);
    }
});

router.get('/project/:id(\\d+)', function (req: Request, res: Response) {
    if (req.session!.user) {
        let idx: number = Number(req.params.id);
        new SVEAccount(req.session!.user as SessionUserInitializer, (user) => {
            new SVEProject(idx as number, user, (self) => {
                if (self.getID() === NaN) {
                    res.sendStatus(404);
                } else {
                    try {
                        self.getGroup().getRightsForUser(user).then(val => {
                            if(val.read) {
                                res.json({
                                    id: self.getID(),
                                    group: self.getGroup().getID(),
                                    owner: (self as SVEProject).getOwnerID(),
                                    type: self.getType(),
                                    name: self.getName(),
                                    splashImgID: self.getSplashImgID(),
                                    dateRange: self.getDateRange(),
                                    state: self.getState()
                                });
                            } else {
                                res.sendStatus(401);
                            }
                        }, err => res.sendStatus(500));
                    } catch (error) {
                        res.sendStatus(404);
                    }
                }
            });
        });
    } else {
        res.sendStatus(401);
    }
});

router.get('/project/:id/data', function (req: Request, res: Response) {
    if (req.session!.user) {
        let idx = Number(req.params.id);
        new SVEAccount(req.session!.user as SessionUserInitializer, (user) => {
            new SVEProject(idx, user, (self) => {
                if(self !== undefined && self.getID() != NaN) {
                    self.getGroup().getRightsForUser(user).then(val => {
                        if (val.read) {
                            self.getData().then((data) => {
                                let list: SVEDataInitializer[] = [];
                                data.forEach(d => { list.push({
                                        id: d.getID(),
                                        type: d.getType(),
                                        owner: d.getOwnerID()
                                    } as SVEDataInitializer)
                                });
                                res.json(list);
                            }, (err) => {
                                res.sendStatus(500);
                            });
                        } else {
                            res.sendStatus(401);
                        }
                    }, err => res.sendStatus(500));
                } else {
                    res.sendStatus(404);
                }
            });
        });
    } else {
        res.sendStatus(401);
    }
});

function setFileRequestHeaders(file: SVEData, fetchType: string, res: Response) {
    res.set({
        'Cache-Control': file.getCacheType(),
        'Content-Type': file.getContentType(),
        'Accept-Ranges': 'bytes',
        'Content-Length': file.getSize((fetchType == "download" || fetchType == "full") ? SVEDataVersion.Full : SVEDataVersion.Preview),
        'Content-Disposition': (fetchType == "download") ? 'attachment; filename=' + file.getName() : 'inline'
    });
}

router.head('/project/:id/data/:fid(\\d+)/:fetchType(|full|preview|download)', function (req: Request, res: Response) {
    if (req.session!.user) {
        let pid = Number(req.params.id);
        let fid = Number(req.params.fid);
        let fetchType = req.params.fetchType as string || "full";
        new SVEAccount(req.session!.user as SessionUserInitializer, (user) => {
            new SVEProject(pid, user, (self) => {
                if(self !== undefined && self.getID() != NaN) {
                    self.getGroup().getRightsForUser(user).then(val => {
                        (self as SVEProject).getDataById(fid).then(file => {
                            setFileRequestHeaders(file, fetchType, res);
                        });
                    });
                }
            });
        });
    } else {
        res.sendStatus(401);
    } 
});

router.get('/project/:id/data/:fid(\\d+)/:fetchType(|full|preview|download)', function (req: Request, res: Response) {
    if (req.session!.user) {
        let pid = Number(req.params.id);
        let fid = Number(req.params.fid);
        let fetchType = req.params.fetchType as string || "full";
        new SVEAccount(req.session!.user as SessionUserInitializer, (user) => {
            new SVEProject(pid, user, (self) => {
                if(self !== undefined && self.getID() != NaN) {
                    self.getGroup().getRightsForUser(user).then(val => {
                        if (val.read) {
                            // check range request
                            let range: Ranges | undefined | -1 | -2 = req.range(1e+9); // max one GB
                            (self as SVEProject).getDataById(fid).then(file => {
                                file.getStream(
                                    (fetchType == "download" || fetchType == "full") ? SVEDataVersion.Full : SVEDataVersion.Preview,
                                    (range !== undefined && range !== -1 && range !== -2 && (range as Ranges).length > 0) ? (range as Ranges)[0] : undefined
                                ).then(stream => {
                                    setFileRequestHeaders(file, fetchType, res);
                                    stream.pipe(res);
                                }, err => {
                                    console.log("Error in stream of file: " + fid + " (" + JSON.stringify(err) + ")!");
                                    res.sendStatus(500)
                                });
                            }, err => res.sendStatus(404));
                        } else {
                            res.sendStatus(401);
                        }
                    }, err => res.sendStatus(500));
                } else {
                    res.sendStatus(404);
                }
            });
        });
    } else {
        res.sendStatus(401);
    }
});

function move(oldPath: string, newPath: string, callback: (err?:any) => void) {
    fs.mkdir(dirname(newPath), {recursive: true}, (err) => {
        fs.rename(oldPath, newPath, function (err) {
            if (err) {
                if (err.code === 'EXDEV') {
                    copy();
                } else {
                    callback(err);
                }
                return;
            }
            callback();
        });
    
        function copy() {
            var readStream = fs.createReadStream(oldPath);
            var writeStream = fs.createWriteStream(newPath);
    
            readStream.on('error', callback);
            writeStream.on('error', callback);
    
            readStream.on('close', function () {
                fs.unlink(oldPath, callback);
            });
    
            readStream.pipe(writeStream);
        }
    });
}

router.delete('/project/:id/data/:fid(\\d+)', function (req: Request, res: Response) {
    if (req.session!.user) {
        let pid = Number(req.params.id);
        let fid = Number(req.params.fid);
        new SVEAccount(req.session!.user as SessionUserInitializer, (user) => {
            new SVEProject(pid, user, (self) => {
                if(self !== undefined && self.getID() != NaN) {
                    self.getGroup().getRightsForUser(user).then(val => {
                        if (val.write) {
                            (self as SVEProject).getDataById(fid).then(file => {
                                file.remove().then(val => {
                                    res.sendStatus((val) ? 200 : 500);
                                });
                            });
                        } else {
                            res.sendStatus(401);
                        }
                    });
                } else {
                    res.sendStatus(404);
                }
            });
        });
    } else {
        res.sendStatus(401);
    }
});

router.post('/project/:id/data/upload', function (req: Request, res: Response) {
    if (req.session!.user) {
        let idx = Number(req.params.id);
        new SVEAccount(req.session!.user as SessionUserInitializer, (user) => {
            new SVEProject(idx, user, (prj) => {
                prj.getGroup()!.getRightsForUser(user).then(val => {
                    if (val.write) {
                        HugeUploader(req, tmpDir, 9999, 50).then((assembleChunks) => {
                            res.writeHead(204, 'No Content');
                            res.end();
                            if (assembleChunks) {
                                assembleChunks().then(data => {
                                    let postProcessing = async() => {
                                        let fileDest = SVESystemInfo.getInstance().sources.sveDataPath! + "/" + prj.getName() + "/" + user.getName() + "/" + data.postParams.fileName;
                                        move(data.filePath, fileDest, (err) => {
                                            if(err) {
                                                console.log("Error on copy: " + JSON.stringify(err));
                                            } else {
                                                console.log("Received file: " + JSON.stringify(data.postParams));
                                                new SVEData(user, {
                                                    type: SVEData.getTypeFromExt(fileDest), 
                                                    owner: user, parentProject: prj, 
                                                    path: {filePath: fileDest, thumbnailPath: ""},
                                                    creation: (data.postParams.created !== undefined && data.postParams.created != "undefined") ? new Date(Number(data.postParams.created)) : new Date()
                                                } as SVEDataInitializer, (data: SVEData) => {
                                                    data.store().then(val => {
                                                        if(!val)
                                                            console.log("Error on file post-processing!");
                                                    }, err => console.log(err));
                                                });
                                            }
                                        });
                                    };
                                    postProcessing().catch(err => {});
                                }).catch(err => console.log(err));
                            }
                        }).catch((err) => {
                            console.log("File receive error: " + JSON.stringify(err));
                            res.status(400);
                        });

                        /*const form = new formidable.IncomingForm({ captureRejections: true });
                        form.keepExtensions = true;
                        form.uploadDir = SVESystemInfo.getInstance().sources.sveDataPath! + "/" + prj.getName() + "/" + user.getName();
                        form.type = 'multipart';
                        form.once('error', console.error);
                        form.on('progress', (bytesReceived, bytesExpected) => {
                            req.session!.uploadProgress = bytesReceived / bytesExpected;
                        });
                        let uploadfile: any;
                        let uploadfilename: string;
                        form.on('fileBegin', (filename, file) => {
                            uploadfile = file;
                            uploadfilename = filename;
                            form.emit('data', { name: 'fileBegin', filename, value: file });
                        });
                        form.once('end', () => {
                            console.log("End upload: " + JSON.stringify(uploadfile));
                            new SVEData(user, {type: SVEData.getTypeFromExt(uploadfilename), owner: user, parentProject: prj, path: {filePath: form.uploadDir, thumbnailPath: ""}} as SVEDataInitializer, (data: SVEData) => {
                                data.store();
                            });
                        });

                        mkdir(form.uploadDir, {recursive: true}, (err) => {
                            if(err) {
                                console.log("Error on creating upload dir: " + JSON.stringify(err));
                            }

                            form.parse(req, (err, fields, files) => {
                                if (err) {
                                    console.log("File upload error: " + JSON.stringify(err));
                                    return;
                                }
                                res.json({ fields, files });
                            });
                        });*/
                    } else {
                        res.sendStatus(401);
                    }
                }, err => res.sendStatus(500));
            });
        });
    } else {
        res.sendStatus(401);
    }
});

router.get('/project/:id/data/upload', function (req: Request, res: Response) {
    resumable.get(req, function(status: string, filename: string, original_filename: string, identifier: string){
        console.log('GET', status);
        res.send((status == 'found' ? 200 : 404));
    });
});

router.get('/data/:id', function (req: Request, res: Response) {
    if (req.session!.user) {
        let idx = Number(req.params.id);
        new SVEAccount(req.session!.user as SessionUserInitializer, (user) => {
            new SVEData(user, idx, (self) => {
                if (self.getID() < 0) {
                    res.sendStatus(401);
                } else {
                    res.json({
                        id: self.getID(),
                        type: self.getType(),
                        project: self.getProject(),
                        owner: self.getOwnerID(),
                        creation: self.getCreationDate(),
                        lastAccess: self.getLastAccessDate()
                    });
                }
            });
        });
    } else {
        res.sendStatus(401);
    }
});

router.get('/user/:id', function (req: Request, res: Response) {
    if (req.session!.user) {
        let idx = Number(req.params.id);
        let user = new SVEAccount({id: idx} as BasicUserInitializer, (state) => {
            res.json({
                id: user.getID(),
                loginState: user.getLoginState(),
                name: user.getName()
            });
        });
    } else {
        res.sendStatus(401);
    }
});

router.post('/doLogin', function (req: Request, res: Response) {
    let acc: SVEAccount;
    const onLogin = (user: SVEBaseAccount) => {
        if (user.getState() !== LoginState.NotLoggedIn) {
            acc.setSessionID(req.session!.id);
            req.session!.user = acc;
            console.log("Logged in user: " + req.session!.user.getName());
            res.json({
                success: user.getState() !== LoginState.NotLoggedIn,
                user: acc.getName(),
                id: acc.getID()
            });
        } else {
            req.session!.user = undefined;
            res.json({
                success: false,
                user: ""
            });
        }
    };

    if (req.body.user && typeof req.body.user === "string") {
        if (req.body.token) {
            acc = new SVEAccount({
                name: req.body.user as string, 
                token:req.body.token as string
            }, onLogin);
        } else {
            acc = new SVEAccount({
                name: req.body.user as string, 
                pass:req.body.pw as string
            }, onLogin);
        }
    } else {
        res.sendStatus(400);
    }
});

export {
    router
};