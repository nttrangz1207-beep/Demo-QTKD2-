#!/usr/bin/env ruby
# Zero-dependency local server for Minh An B2B Sales Opportunity AI Agent
# Run with: ruby --disable-gems server.rb

require 'webrick'
require 'json'
require 'net/http'
require 'uri'
require 'fileutils'
require 'time'

ROOT_DIR = File.expand_path(__dir__)
APP_DIR  = File.expand_path(ENV['APP_DIR'] || File.join(ROOT_DIR, 'app'))
DATA_DIR = File.join(ROOT_DIR, 'data')
DOCS_DIR = File.join(ROOT_DIR, 'docs')
LOGS_DIR = File.join(ROOT_DIR, 'logs')
FileUtils.mkdir_p(LOGS_DIR)

PORT = (ENV['PORT'] || 8080).to_i

def fetch_with_redirects(url_str, limit = 5)
  raise 'Too many redirects' if limit <= 0
  uri = URI.parse(url_str)
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = (uri.scheme == 'https')
  http.open_timeout = 15
  http.read_timeout = 25

  request = Net::HTTP::Get.new(uri.request_uri)
  request['User-Agent'] = 'MinhAn-B2B-Agent/1.0'
  response = http.request(request)

  case response
  when Net::HTTPRedirection
    location = response['location']
    new_uri = URI.join(url_str, location).to_s
    fetch_with_redirects(new_uri, limit - 1)
  else
    response
  end
end

server = WEBrick::HTTPServer.new(
  Port: PORT,
  BindAddress: '127.0.0.1',
  AccessLog: [],
  Logger: WEBrick::Log.new($stdout, WEBrick::Log::INFO)
)

server.mount('/', WEBrick::HTTPServlet::FileHandler, APP_DIR, { FancyIndexing: false })
server.mount('/data', WEBrick::HTTPServlet::FileHandler, DATA_DIR)
server.mount('/docs', WEBrick::HTTPServlet::FileHandler, DOCS_DIR)

server.mount_proc('/sales_data.csv') do |_req, res|
  csv_path = File.join(ROOT_DIR, 'sales_data.csv')
  if File.exist?(csv_path)
    res.status = 200
    res['Content-Type'] = 'text/csv; charset=utf-8'
    res.body = File.read(csv_path, encoding: 'UTF-8')
  else
    res.status = 404
    res.body = 'Not found'
  end
end

server.mount_proc('/api/health') do |_req, res|
  res.status = 200
  res['Content-Type'] = 'application/json; charset=utf-8'
  res.body = JSON.generate({ status: 'ok', service: 'Minh An AI Agent Server', time: Time.now.iso8601 })
end

server.mount_proc('/api/fetch-gsheet') do |req, res|
  res['Access-Control-Allow-Origin'] = '*'
  raw_url = req.query['url'].to_s.strip
  mode = req.query['mode'].to_s.strip # 'xlsx' (default) or 'csv'

  if raw_url.empty?
    res.status = 400
    res['Content-Type'] = 'application/json; charset=utf-8'
    res.body = JSON.generate({ error: 'Thiếu tham số url Google Sheet.' })
    next
  end

  match = raw_url.match(%r{docs\.google\.com/spreadsheets/d/([a-zA-Z0-9_-]+)})
  unless match
    res.status = 400
    res['Content-Type'] = 'application/json; charset=utf-8'
    res.body = JSON.generate({ error: 'Link không đúng định dạng Google Sheets (https://docs.google.com/spreadsheets/d/...).' })
    next
  end

  sheet_id = match[1]
  gid_match = raw_url.match(/[?&#]gid=(\d+)/)
  gid = gid_match ? gid_match[1] : nil

  export_url =
    if mode == 'csv' || (mode.empty? && gid && raw_url.include?('output=csv'))
      "https://docs.google.com/spreadsheets/d/#{sheet_id}/export?format=csv#{gid ? "&gid=#{gid}" : ''}"
    else
      "https://docs.google.com/spreadsheets/d/#{sheet_id}/export?format=xlsx"
    end

  begin
    upstream = fetch_with_redirects(export_url)
    if upstream.code.to_i >= 200 && upstream.code.to_i < 300
      ctype = upstream['content-type'] || ''
      if ctype.include?('text/html')
        res.status = 403
        res['Content-Type'] = 'application/json; charset=utf-8'
        res.body = JSON.generate({
          error: 'Google Sheet chưa bật quyền chia sẻ công khai ("Bất kỳ ai có đường liên kết đều có thể xem").'
        })
      else
        res.status = 200
        res['Content-Type'] = mode == 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        res['X-GSheet-Export-Url'] = export_url
        res.body = upstream.body
      end
    else
      res.status = upstream.code.to_i
      res['Content-Type'] = 'application/json; charset=utf-8'
      res.body = JSON.generate({ error: "Không thể tải Google Sheet (HTTP #{upstream.code}). Hãy kiểm tra quyền chia sẻ công khai." })
    end
  rescue => e
    res.status = 502
    res['Content-Type'] = 'application/json; charset=utf-8'
    res.body = JSON.generate({ error: "Lỗi kết nối Google Sheets: #{e.message}" })
  end
end

server.mount_proc('/api/logs') do |req, res|
  res['Access-Control-Allow-Origin'] = '*'
  res['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
  res['Access-Control-Allow-Headers'] = 'Content-Type'

  if req.request_method == 'OPTIONS'
    res.status = 204
    next
  end

  if req.request_method == 'POST'
    begin
      payload = JSON.parse(req.body.to_s)
      ts = Time.now.strftime('%Y%m%d_%H%M%S')
      filename = "audit_#{ts}.json"
      filepath = File.join(LOGS_DIR, filename)
      File.write(filepath, JSON.pretty_generate(payload))
      res.status = 200
      res['Content-Type'] = 'application/json; charset=utf-8'
      res.body = JSON.generate({ saved: true, filename: filename, path: filepath })
    rescue => e
      res.status = 400
      res['Content-Type'] = 'application/json; charset=utf-8'
      res.body = JSON.generate({ error: e.message })
    end
  else
    files = Dir.glob(File.join(LOGS_DIR, 'audit_*.json')).sort.reverse.first(20).map do |f|
      { filename: File.basename(f), size: File.size(f), mtime: File.mtime(f).iso8601 }
    end
    res.status = 200
    res['Content-Type'] = 'application/json; charset=utf-8'
    res.body = JSON.generate({ logs: files })
  end
end

trap('INT') { server.shutdown }
trap('TERM') { server.shutdown }

puts "=========================================================="
puts " Minh An B2B AI Agent Server running at:"
puts " -> http://127.0.0.1:#{PORT}"
puts "=========================================================="
server.start
