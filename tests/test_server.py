import pytest
import aviocular.server as server_module
from aviocular.server import app

SAMPLE_TRACKS = {
    'videos': [{'name': 'DJI_0001', 'color': 'hsl(0, 72%, 58%)', 'points': []}]
}


@pytest.fixture
def client():
    server_module.TRACKS = {}
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


def test_index(client):
    assert client.get('/').status_code == 200


def test_get_tracks_empty(client):
    assert client.get('/api/tracks').get_json() == {}


def test_post_tracks(client):
    r = client.post('/api/tracks', json=SAMPLE_TRACKS)
    assert r.status_code == 204


def test_post_then_get_tracks(client):
    client.post('/api/tracks', json=SAMPLE_TRACKS)
    data = client.get('/api/tracks').get_json()
    assert data == SAMPLE_TRACKS
    assert data['videos'][0]['name'] == 'DJI_0001'
