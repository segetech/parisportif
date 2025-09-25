import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import localizedFormat from "dayjs/plugin/localizedFormat";
import "dayjs/locale/fr";

// Configure dayjs for French and Africa/Bamako (UTC+0)
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(localizedFormat);
dayjs.locale("fr");
dayjs.tz.setDefault("Africa/Bamako");

export default dayjs;
export const TIMEZONE = "Africa/Bamako";
export const DATE_FORMAT = "YYYY-MM-DD";
export const TIME_FORMAT = "HH:mm";
