var getlist = function (getlisturl) {
    var nowPage = 1, startlist = true;
    var myData = { page: 0, total: 0, length: 0 }
    var watch = new watchdata();
    watch.setwatch(myData);

    return {
        init: function () {
            var that = this;
            //上一页
            $('#preBtn').click(function () {
                if (nowPage > 1) {
                    nowPage--;
                    that.getlist(nowPage);
                }
            })
            //下一页
            $('#nextBtn').click(function () {
                if (nowPage < myData.total) {
                    nowPage++;
                    that.getlist(nowPage);
                }
            })
            //跳转页码
            $('#gotopage').keyup(function (event) {
                if (event.keyCode == 13) {
                    var num = parseInt($(this).val());
                    if (num < 1 || num > myData.total) {
                        return;
                    }
                    nowPage = num;
                    that.getlist(nowPage);
                }
            });
        },
        //读取用户数据
        list: function (page, size) {
            if (!startlist || !getlisturl) {
                layer.load(1, {
                    time: 2000,
                    shade: [0.2, '#fff']
                });
                return;
            }
            startlist = false;
            size = size || 10;
            $.ajax({
                type: "GET",
                url: getlisturl,
                data: { size: size, page: page || nowPage },
                headers: {
                    Authorization: "Bearer " + window.localStorage.getItem('flashmeToken')
                },
                success: function (result) {
                    console.log(result);
                    if (!result.state){
                        layer.confirm(result.msg, {
                            btn: ['去登录', '知道了'],
                            title: false, //不显示标题
                            shadeClose: true, //开启遮罩关闭
                            closeBtn: 0, //隐藏关闭按钮
                            // time: 2000, //2秒后自动关闭
                        }, function () {
                            window.location.href = "/login#"+window.location.href;
                        });
                        return;
                    }
                    myData.page = page || 1;//页数
                    myData.length = result.length;//总条数
                    myData.total = Math.ceil(result.length / size);//总页数
                    nowPage = myData.page;
                    // $('.listdata').html("");
                    if (result.state && result.data.length > 0) {
                        $('.listdata').html(template('table-art', result.data));
                        $('.username').length > 0 && $('.username').text(result.user.name);
                        $('.useremail').length > 0 && $('.useremail').text(result.user.email);
                        $('.userrole').length > 0 && $('.userrole').text(result.user.role);
                    }else{
                        window.localStorage.getItem('flashmeToken') && layer.msg('未获得数据！');
                    }
                    startlist = true;
                },
                error: function (err) {
                    if (err.status == 403) {
                        layer.msg('您无权限浏览！请联系管理员！');
                    }
                    startlist = true;
                }
            });
        }
    }
}

