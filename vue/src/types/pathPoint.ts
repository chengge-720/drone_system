/**
 * 路径点（WGS84 经纬度 + 海拔高度，单位：米）
 * alt 表示海拔或相对基准高度（与业务约定一致即可）
 */
export interface PathPoint {
  lng: number
  lat: number
  alt: number
}

export type PathPointInput = Partial<PathPoint> & { lng: number; lat: number }
