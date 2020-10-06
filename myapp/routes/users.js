var express = require('express');
var router = express.Router();
var path = require('path');

//加密模块
var crypto = require('crypto');

//用户权限模块
const casbin = require('casbin');
const authz = require('casbin-express-authz');
const enforcer = casbin.newEnforcer(path.join(__dirname, '../data/authz_model.conf'), path.join(__dirname, '../data/authz_policy.csv'));

var pass = require('../common/passport');
var user = require('../common/user');
var core = require('../common/core');


//用户管理页
router.get('/', function (req, res, next) {
  res.render('userlist', { menuactive: "menu_user" });
});

/* 修改用户页面. */
router.get('/edit', function (req, res, next) {
  user.getrole().then(function (rows) {
    res.render('useredit', { rows: rows });
  })
});



//*
//=================================登录判断，给下面权限模块判断 res.locals.username
//*
router.all('*', pass.passport.authenticate('jwt', { session: false, failureRedirect: '/error/auth?msg=请先登录！' }), (req, res, next) => {
  res.locals.username = req.user.role;//获取角色
  next();
});

router.post('/', function (req, res, next) {
  var theuser = {
    id: req.user.id,
    name: req.user.name,
    email: req.user.email
  };
  res.json({ state: true, msg: "登录信息", user: theuser });
});

//=================================拉取用户列表（查）

router.get('/data', authz.authz({ newEnforcer: enforcer }), function (req, res, next) {
  var size = req.query.size.trim();
  var page = req.query.page.trim();
  user.userlist({ size: size, num: page }).then(function (rows) {
    res.json({ state: true, msg: "获取用户数据", length: rows.length, data: rows.rows });
  })
});

//================================新增账户（增）

router.post('/data', authz.authz({ newEnforcer: enforcer }), function (req, res, next) {
  var name = req.body.name.trim();
  var password = req.body.password.trim();
  var role = req.body.role.trim();

  if (!name || !password) {
    res.json({ msg: "请正确填写注册信息！" });
    return;
  }
  if (password.length < 6) {
    res.json({ msg: "密码需至少6位！" });
    return;
  }
  //验证用户名合法性
  var regName = core.confirmName(name);
  if (regName) {
    res.json({ msg: regName });
    return;
  }

  //检查账户
  user.userget({ name: [name] }).then(function (row) {
    // usually this would be a database call:
    if (row[0] && row[0].name == name) {
      res.json({ msg: "已有此用户名！" });
      return;
    }
    // Hmac加密
    var hash = crypto.createHmac('sha512', core.key)
    hash.update(password)
    var miwen = hash.digest('hex')
    //新增账户
    return user.useradd([name, "", miwen, role]);

  }).then(function (err) {
    if (!err) {
      res.json({ state: true, msg: "新增成功" });
      // pass.resetUser();
    } else {
      res.json({ msg: "新增失败！" });
    }
  })
})

//================================删除账户（删）

router.delete('/data', authz.authz({ newEnforcer: enforcer }), function (req, res, next) {
  var id = req.body.id.trim();
  if (id.split(',').indexOf("1") != -1) {
    res.json({ msg: "不允许删除初始管理员！" });
    return;
  }
  user.userdel(id).then(function (err) {
    if (!err) {
      res.json({ state: true, msg: "删除成功" });
      // pass.resetUser();
    } else {
      res.json({ msg: "删除失败！" });
    }
  })
})


//================================修改账户（改）

router.put('/data', authz.authz({ newEnforcer: enforcer }), function (req, res, next) {
  var id = req.body.id.trim();
  var name = req.body.name.trim();
  var password = req.body.password.trim();
  var role = req.body.role.trim();

  // var token = pass.getToken(req.get('Authorization'));//解析用户token内的信息

  if (req.user.id != 1 && id == 1) {
    res.json({ msg: "您无权限修改初始管理员！" });
    return;
  }
  if (!id) {
    res.json({ msg: "没有修改信息！" });
    return;
  }
  //验证用户名合法性
  var regName = core.confirmName(name);
  if (name && regName) {
    res.json({ msg: regName });
    return;
  }
  var updata = { id: id, data: { role: role } }
  if (password && password.length < 6) {
    res.json({ msg: "密码需至少6位！" });
    return;
  }
  if (password) {
    // Hmac加密
    var hash = crypto.createHmac('sha512', core.key)
    hash.update(password)
    var miwen = hash.digest('hex')
    updata.data["password"] = miwen;
  }
  if (role) {
    updata.data["role"] = role;
  }
  if (name) {
    //检查账户
    user.userget({ name: [name] }).then(function (row) {
      // usually this would be a database call:
      if (row[0] && row[0].name == name) {
        res.json({ msg: "已有此用户名！" });
        return;
      }
      updata.data["name"] = name;
      useredit(updata, res);
    })
  } else if (password || role) {
    useredit(updata, res);
  } else {
    res.json({ state: false, msg: "什么也没修改！" });
  }


})
function useredit(updata, res) {
  user.useredit(updata).then(function (err) {
    if (!err) {
      res.json({ state: true, msg: "修改成功" });
      // pass.resetUser();
    } else {
      res.json({ state: false, msg: "修改失败！" });
    }
  })
}


module.exports = router;
