// Weigh-ins from a CSV file (EufyLife's export, spreadsheets, other apps): the reader is shared with Forza!
// Coach, so both read a file the same way.
export { memberFor, parseWeightCsv, type CsvWeight as ParsedWeight } from '../../../shared/weight-csv.mjs'
