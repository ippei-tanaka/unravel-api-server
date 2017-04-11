import express, {Router} from "express";
import pluralize from 'pluralize';
import PassportManager from './passport-manager';
import UserModel from './models/user-model';
import CategoryModel from './models/category-model';
import PostModel from './models/post-model';
import SettingModel from './models/setting-model';
import setUpDbConnection from './models/setup-db-connection';
import {ObjectID} from 'mongodb';
import {successHandler, errorHandler, parseParameters, isLoggedIn, isLoggedOut} from './handlers';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import expressSession from 'express-session';

const addRoutesForCrudOperations = (Model, app, filter) =>
{
    const path = pluralize(Model.name);

    app.get(`/${path}`, filter, (request, response) => (async () =>
    {
        const {query, sort, limit, skip} = parseParameters(request.url);
        const models = await Model.findMany({query, sort, limit, skip});
        successHandler(response, {items: models});
    })().catch(errorHandler(response)));

    app.get(`/${path}/:id`, filter, (request, response) => (async () =>
    {
        const model = await Model.findOne({_id: new ObjectID(request.params.id)});
        successHandler(response, model);
    })().catch(errorHandler(response)));

    app.post(`/${path}`, filter, (request, response) => (async () =>
    {
        const model = new Model(request.body);
        await model.save();
        successHandler(response, {_id: model.id});
    })().catch(errorHandler(response)));

    app.put(`/${path}/:id`, filter, (request, response) => (async () =>
    {
        const model = await Model.findOne({_id: new ObjectID(request.params.id)});

        if (model)
        {
            Object.assign(model.values, request.body);
            await model.save();
        }
        successHandler(response, {});
    })().catch(errorHandler(response)));

    app.delete(`/${path}/:id`, filter, (request, response) => (async () =>
    {
        await Model.deleteOne({_id: new ObjectID(request.params.id)});
        successHandler(response, {});
    })().catch(errorHandler(response)));

    return app;
};


const addRoutesForAuth = (app, loginCheck, logoutCheck, authentication) =>
{
    app.post('/login', logoutCheck, authentication, (request, response) =>
    {
        successHandler(response, {});
    });

    app.get('/logout', loginCheck, (request, response) =>
    {
        request.logout();
        successHandler(response, {});
    });

    return app;
};

const addRoutesForHome = (app) =>
{
    app.get(`/`, (request, response) => (async () =>
    {
        successHandler(response, {});
    })().catch(errorHandler(response)));

    return app;
};

const addRoutesForUser = (app, filter) =>
{
    app.get(`/users/me`, filter, (request, response) => (async () =>
    {
        if (request.user)
        {
            const model = await UserModel.findOne({_id: new ObjectID(request.user._id)});
            successHandler(response, model);
        }
        else
        {
            successHandler(response, null);
        }
    })().catch(errorHandler(response)));

    app.put(`/users/:id/password`, filter, (request, response) => (async () =>
    {
        const model = await UserModel.findOne({_id: new ObjectID(request.params.id)});

        if (model)
        {
            Object.assign(model.values, request.body, {password_update: true});
            await model.save();
        }

        successHandler(response, {});
    })().catch(errorHandler(response)));

    return app;
};

const addRoutesForSetting = (app, filter) =>
{
    app.get(`/setting`, filter, (request, response) => (async () =>
    {
        const model = await SettingModel.getSetting();
        successHandler(response, model);
    })().catch(errorHandler(response)));

    app.put(`/setting`, filter, (request, response) => (async () =>
    {
        await SettingModel.setSetting(request.body);
        successHandler(response, {});
    })().catch(errorHandler(response)));

    return app;
};


/*

const addRoutesForThemes = (app, filter) =>
{
    const themeDir = path.resolve(__dirname, '../public-app/static/bundle/themes');

    app.get(`/themes`, filter, (request, response) => co(function* ()
    {
        const fileNames = yield new Promise((res, rej) => fs.readdir(themeDir, (err, result) =>
        {
            if (err) return rej(err);
        res(result);
    }));

        const nameCounts = {};
        const regexBase = /^(.+)-base\.css$/;
        const regexPost = /^(.+)-post\.css$/;

        for (const fileName of fileNames)
        {
            if (regexBase.test(fileName))
            {
                const name = RegExp.$1;
                nameCounts[name] = Number.isInteger(nameCounts[name]) ? nameCounts[name] + 1 : 1;
            }
            else if (regexPost.test(fileName))
            {
                const name = RegExp.$1;
                nameCounts[name] = Number.isInteger(nameCounts[name]) ? nameCounts[name] + 1 : 1;
            }
        }

        const items = [];

        for (const name of Object.keys(nameCounts))
        {
            if (nameCounts[name] >= 2)
            {
                items.push({name});
            }
        }

        successHandler(response, {items});

    }).catch(errorHandler(response)));

    return app;
};
*/

export default class AdminApiApp {

    constructor ({sessionSecret, dbHost, dbPort, dbName})
    {
        setUpDbConnection({dbHost, dbPort, dbName});

        const app = express();

        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({extended: false}));
        app.use(cookieParser());
        app.use(expressSession({
            secret: sessionSecret,
            resave: true,
            saveUninitialized: true
        }));

        app.use(PassportManager.passport.initialize());
        app.use(PassportManager.passport.session());

        let router = new Router();

        // The order of those functions matters.
        router = addRoutesForHome(router);
        router = addRoutesForAuth(router, isLoggedIn, isLoggedOut, PassportManager.localAuth);
        router = addRoutesForUser(router, isLoggedIn);
        router = addRoutesForCrudOperations(UserModel, router, isLoggedIn);
        router = addRoutesForCrudOperations(CategoryModel, router, isLoggedIn);
        router = addRoutesForCrudOperations(PostModel, router, isLoggedIn);
        router = addRoutesForSetting(router, isLoggedIn);
        //router = addRoutesForThemes(router, isLoggedIn);

        app.use(router);

        // adding class methods to the express app

        for (let propName of Object.getOwnPropertyNames(this.constructor.prototype))
        {
            if (propName === "constructor") continue;
            app[propName] = this[propName].bind(this);
        }

        return app;
    }

    async insertUser ({email, password, display_name, slug})
    {
        const user = await UserModel.findOne({email});

        if (!user)
        {
            await new UserModel({email, password, display_name, slug}).save();
        }
    }

};