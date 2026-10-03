from lib.db import db


class ActivitiesTrending:
  """Most-liked activities in the last 7 days (sidebar, backlog #20)."""

  @staticmethod
  def run():
    sql = db.template('activities', 'trending')
    return db.query_array_json(sql)
