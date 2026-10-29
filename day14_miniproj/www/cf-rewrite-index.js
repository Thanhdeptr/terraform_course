function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.charAt(uri.length - 1) === "/") {
    request.uri += "index.html";
  } else if (uri.indexOf(".") === -1) {
    request.uri += "/index.html";
  }
  return request;
}
// do khi nguời dùng search devopsminilab.com/workout thì tự động nó sẽ tìm tên get/workout thì nó sẽ tìm địa chỉ chính xác
//  nghĩa là tìm địa chỉ có tên workout không phải folder workout/index.html nên phải có dịch địa chỉ
