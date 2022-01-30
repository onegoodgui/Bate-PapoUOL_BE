
import express from "express";
import cors from 'cors';
import { MongoClient, ObjectId } from "mongodb";
import dotenv from 'dotenv';
import joi from 'joi';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import {strict as assert} from 'assert'
import {stripHtml} from 'string-strip-html'

dayjs.extend(timezone);
dayjs.tz.setDefault("America/Sao_Paulo")

dotenv.config();

const server = express();
server.use(cors());
server.use(express.json());
server.listen(5000);


const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

const userSchema = joi.object({
    name: joi.string().required(),
})

const messageSchema = joi.object({
    from: joi.string().required(),
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.string().valid('message','private_message').required()
})

setInterval(async ()=>{
    const timeNow = Date.now()

    try{
        mongoClient.connect();
        db = mongoClient.db('Bate-PapoUOL');
        const usersCollection = db.collection('users_UOL');
        const offlineUsers = await usersCollection.deleteMany( 
            { $expr:
                { $gt: [ {$subtract: [timeNow, "$lastStatus"] },  10000] }
            }
        );
          console.log(offlineUsers);
          mongoClient.close();
    }
    catch(error){
        console.log(error);
        mongoClient.close();
    }

},15000)

server.post('/participants', async (req, res) => {

    const username = req.body;
    username.name = stripHtml(username.name, {trimOnlySpaces:true}).result;


    let lastStatus = {lastStatus: ''};
    lastStatus.lastStatus = Date.now();
    const user = {...username, ...lastStatus};
    
    const validation = userSchema.validate(username, {abortEarly: true});
    if (validation.error){
        res.status(422).send('Nome de usuário inválido');
        return
    }

    try{

        await mongoClient.connect();
        db = mongoClient.db('Bate-PapoUOL');
        const usersCollection = db.collection('users_UOL');
        const existentUser = await usersCollection.find({name: user.name}).toArray();

        if(existentUser.length !== 0){
            res.status(409).send('Usuário já existente');
            mongoClient.close();
            return
        }
   
        // Conferir o array de usuários do usersCollection
        const userList = await usersCollection.find({}).toArray();
        console.log(userList);

        // Enviar o objeto com o nome de usuário para o usersCollection
        const newUser = await usersCollection.insertOne(user);

        // Setar o horário de acordo com o fuso-horário América/São Paulo
        let time = dayjs(user.lastStatus).format('HH:mm:ss');
        console.log(time);

        

        // Enviar o objeto com a mensagem de entrada pro messagesCollection
        const messagesCollection = db.collection('messages_UOL');
        const newMessage = await messagesCollection.insertOne({from: user.name , to: 'Todos', text: 'entra na sala...', type: 'status', time: time})
        console.log(newMessage);

        // Conferir o array de mensagens do messagesCollection
        const messagesArray = await messagesCollection.find({}).toArray();
        console.log(messagesArray);

        res.status(201).send(newUser);
        mongoClient.close();
        
    }catch(error){
        res.status(500).send(error);
        mongoClient.close();
    }

    if(mongoClient){
        console.log('O código chega aqui!')
        mongoClient.close();
    }
})

server.get('/participants', async (req, res) => {

    try{

        await mongoClient.connect();
        db = mongoClient.db('Bate-PapoUOL');
        const usersCollection = db.collection('users_UOL');
        const usersList = await usersCollection.find({}).toArray();

        res.status(201).send(usersList);
        mongoClient.close();
    }
    catch(error){
        
        res.status(500).send(error);
        mongoClient.close();
    }
})

server.post('/messages', async (req, res) => {
    
    const username = req.headers.user;
    const message = {from: username, ...req.body};

    message.from = stripHtml(message.from, {trimOnlySpaces:true}).result;
    message.to = stripHtml(message.to, {trimOnlySpaces:true}).result;
    message.text = stripHtml(message.text, {trimOnlySpaces:true}).result;


    const validation = messageSchema.validate(message, { abortEarly: true });

    if (validation.error) {
        console.log(validation.error.details);
        res.status(422).send('Item/itens do objeto com conteúdo inválido');
        return
    }

    let time = Date.now();
    time = dayjs(time).format('HH:mm:ss');
    message.time = time;

    try{
        await mongoClient.connect();
        db = mongoClient.db('Bate-PapoUOL');
        const messagesCollection = db.collection('messages_UOL');
        await messagesCollection.insertOne(message);

        const messagesArray = await messagesCollection.find({}).toArray();
        console.log(messagesArray);
        let reversedMessagesArray = [...messagesArray].reverse();
        console.log(reversedMessagesArray);
        
    }
    catch(error){
        res.status(500).send(error);
        mongoClient.close();
    }
    
    res.status(201).send('Ok');
    mongoClient.close();

})

server.get('/messages', async (req, res) => {

    let limit = parseInt(req.query.limit);
    const user = req.headers.user;

    if(isNaN(limit)){
        limit = 0;
    }

    try{
        await mongoClient.connect();
        db = mongoClient.db('Bate-PapoUOL');
        const messagesCollection = db.collection('messages_UOL');

        const messagesArray = await messagesCollection.find({$or: [
            {from: user},
            {to: {$in: [user, 'Todos']}}
        ]}).sort({_id:-1}).limit(limit).toArray();

        console.log(messagesArray);
        res.status(201).send('ok!')
        mongoClient.close();
    }
    catch(error){
        console.log(error)
        res.status(500).send(error);
        mongoClient.close();
    }
})

server.post('/status', async (req, res) => {
    const user = req.headers.user;

    try{
        await mongoClient.connect();
        db = mongoClient.db('Bate-PapoUOL');
        const usersCollection = db.collection('users_UOL');

        const existentUserArray = await usersCollection.find({name: user}).toArray();

        if(existentUserArray.length === 0){
            res.sendStatus(404);
            mongoClient.close();
            return
        }
        let existentUser = existentUserArray[0];

        existentUser.lastStatus = Date.now();
        console.log(existentUser);

        await usersCollection.updateOne({name:user}, {$set: {lastStatus: existentUser.lastStatus}});

        res.status(200).send('Ok!');
        mongoClient.close();

    }
    catch (error){
        res.sendStatus(500);
        mongoClient.close();
    }
})

server.delete('/messages/:userId', async (req, res) => {

    // const userId = req.params.userId;
    const userName = req.headers.user;
    try{
        mongoClient.connect();
        db = mongoClient.db('Bate-PapoUOL');
        const messagesCollection = db.collection('messages-UOL');
        let messages = await messagesCollection.find({});
        console.log(messages);

        let deletedMessage = await messagesCollection.deleteOne()

    }
    catch(error){
        res.status(500).send(error);
        mongoClient.close()
    }
})