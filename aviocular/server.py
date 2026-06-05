from flask import Flask, Response, jsonify, render_template, request

app = Flask(__name__, static_folder='static', template_folder='templates')

TRACKS: dict = {}


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/tracks', methods=['GET'])
def get_tracks():
    return jsonify(TRACKS)


@app.route('/api/tracks', methods=['POST'])
def post_tracks():
    global TRACKS
    TRACKS = request.get_json(force=True)
    return Response(status=204)
