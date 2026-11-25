export function uploadErrorText(reason: string | undefined): string {
  switch (reason) {
    case "unsupported_type":
      return "Định dạng không hỗ trợ";
    case "too_large":
      return "File quá lớn";
    case "unreadable":
      return "File không đọc được";
    default:
      return "Lỗi tải lên";
  }
}
