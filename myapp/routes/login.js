var express = require('express');
var router = express.Router();

//加密模块
var crypto = require('crypto');
//访问次数限制模块
const rateLimit = require("express-rate-limit");

var pass = require('../common/passport');
var user = require('../common/user');
var core = require('../common/core');
var toemail = require('../common/email');


/* 登录页面. */
router.get('/', function (req, res, next) {
    res.render('login', { msg: "" });
});



//========================================用户登录POST

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 10, // 限制10次请求
    message: "此IP请求登录次数过多，请15分钟后重试"
});
router.post('/', apiLimiter, function (req, res, next) {

    var name = req.body.name.trim();
    var password = req.body.password.trim();
    if (!name || !password) {
        res.json({ msg: "请填写登陆名与密码！" });
        return;
    }
    var json = {};
    !core.confirmEmail(name) ? json.email = [name] : json.name = [name];

    //验证token的用户信息
    var payload,created;
    user.userget(json, "id,name,password").then(function (row) {
        // usually this would be a database call:
        // var theuser = row.find(age => age.name === name);
        var theuser = row[0];
        if(theuser.length==0){
            return "没有此用户！";
        }

        // Hmac加密
        var hash = crypto.createHmac('sha512', core.key)
        hash.update(password)
        var miwen = hash.digest('hex')


        if (theuser.password === miwen) {
            payload = { id: theuser.id };
            created = Math.floor(Date.now() / 1000);
            return user.useredit({ id: theuser.id, data: { dtime: created } })
        } else {
            return "密码错误！";
            // res.status(401).json({ msg: "密码错误！" });
            // res.redirect('/error');
        }
    }).then(function(err){
        if (!err) {
            var token = pass.createToken(payload, created);
            res.json({ state: true, msg: "登录成功", token: token });
        } else {
            res.json({ state: false, msg: err||"登录失败！" });
        }
    })
});


//===============================================用户注册START

function usercheck(obj, res) {
    return new Promise(function (resolve, reject) {
        if (!obj.name || !obj.password || !obj.email) {
            res.json({ msg: "请正确填写注册信息！" });
            return;
        }
        if (obj.password.length < 6) {
            res.json({ msg: "密码需至少6位！" });
            return;
        }
        //验证用户名及邮箱合法性
        var regName = core.confirmName(obj.name);
        var regEmail = core.confirmEmail(obj.email);
        if (regName) {
            res.json({ msg: regName });
            return;
        }
        if (regEmail) {
            res.json({ msg: regEmail });
            return;
        }
        //检查账户
        user.userget({ name: [obj.name], email: [obj.email] }, "id,name,email").then(function (row) {
            // usually this would be a database call:
            if (row[0] && row[0].name == obj.name) {
                res.json({ msg: "已有此用户名！" });
                return;
            }
            if (row[0] && row[0].email == obj.email) {
                res.json({ msg: "此邮箱已注册！" });
                return;
            }

            resolve();


        })
    })
}


const createAccountLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1小时后开放
    max: 20, // 限制20次请求
    message: "您的请求注册次数过多！",
    onLimitReached: function (req, res, options) {
        res.json({ msg: options.message });
    }
});

//=================================用户注册POST口

router.post('/register', createAccountLimiter, function (req, res, next) {

    var name = req.body.name.trim();
    var password = req.body.password.trim();
    var email = req.body.email.trim();

    usercheck({ name: name, password: password, email: email }, res).then(function () {
        res.redirect(307, "useradd");
    })

})
//用户注册最终新增口
const limiter = rateLimit({
    windowMs: 12 * 60 * 60 * 1000, // 12小时后开放
    max: 1, // 限制1次请求
    // skipFailedRequests = true, //不计算失败的请求
    // skipSuccessfulRequests = true, //不计算成功的请求
    message: "一天只能注册一个账号！",
    onLimitReached: function (req, res, options) {
        res.json({ msg: options.message });
    }
});
router.post('/useradd', limiter, function (req, res, next) {
    var name = req.body.name.trim();
    var password = req.body.password.trim();
    var email = req.body.email.trim();

    usercheck({ name: name, password: password, email: email }, res).then(function () {

        // Hmac加密
        var hash = crypto.createHmac('sha512', core.key)
        hash.update(password)
        var miwen = hash.digest('hex')
        //新增账户
        return user.useradd([name, email, miwen])

    }).then(function (err) {
        if (!err) {
            res.json({ state: true, msg: "注册成功" });
        } else {
            res.json({ msg: "注册失败！" });
        }
    })
})
//===============================================用户注册END


//================找回密码

const mailLimiter = rateLimit({
    windowMs: 60 * 1000, // 1分钟
    max: 1, // 限制请求次数
    message: "请1分钟后重试"
});
router.post('/repass', mailLimiter, function (req, res, next) {
    var email = req.body.email.trim();
    var regEmail = core.confirmEmail(email);
    if (regEmail) {
        res.json({ msg: regEmail });
        return;
    }

    //检查账户
    var verify, userid;
    user.userget({ email: [email] }, "id,name,email").then(function (row) {
        if (!row[0] || !row[0].email || row[0].email != email) {
            res.json({ msg: "此邮箱未注册！" });
            return;
        }
        userid = row[0].id;
        verify = core.randomString(6);//生成随机码
        //发送邮件
        return toemail.sendmail({
            subject: 'flashme.cn 密码找回验证', to: '"用户1" <' + email + '>',
            html: '<div style="width: 300px;margin: 20px auto;line-height: 1.7;background: #eee;text-align: center;"><h3>验证码</h3><h2>' + verify + '</h2><h4>此邮件来自：<a href="http://www.flashme.cn">flashme.cn</a></h4></div>'
        })

    }).then(function () {
        req.session.verify_code = verify;
        req.session.verify_email = email;
        req.session.verify_id = userid;
        res.json({ state: true, msg: "发送成功" });
    }, function (err) {
        res.json({ state: false, msg: "发送失败！" + err });
    });
})

const mailLimiter2 = rateLimit({
    windowMs: 60 * 1000, // 1分钟
    max: 3, // 限制请求次数
    message: "多次验证错误！请1分钟后重试",
    onLimitReached: function (req, res, options) {
        res.json({ msg: options.message });
    }
});
router.post('/repassword', mailLimiter2, function (req, res, next) {
    var email = req.body.email.trim();
    var verify = req.body.verify.trim();
    var password = req.body.password.trim();
    if (email != req.session.verify_email || verify != req.session.verify_code) {
        res.json({ msg: "验证失败！" });
        return;
    }
    if (password && password.length < 6) {
        res.json({ msg: "密码需至少6位！" });
        return;
    }
    // Hmac加密
    var hash = crypto.createHmac('sha512', core.key)
    hash.update(password)
    var miwen = hash.digest('hex')

    var updata = { id: req.session.verify_id, data: { password: miwen } }
    user.useredit(updata).then(function (err) {
        if (!err) {
            res.json({ state: true, msg: "修改成功" });
        } else {
            res.json({ state: false, msg: "修改失败！" });
        }
    })
})


module.exports = router;