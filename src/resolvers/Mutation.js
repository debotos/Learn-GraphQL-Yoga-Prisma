import uuidv4 from 'uuid/v4'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const Mutation = {
  async createUser(parent, args, {
    prisma
  }, info) {
    if (args.data.password.length < 8) {
      throw new Error('Password must be 8 characters or longer.')
    }

    const password = await bcrypt.hash(args.data.password, 10)
    const user = prisma.mutation.createUser({
      data: {
        ...args.data,
        password
      }
    }, null)
    return {
      user,
      token: jwt.sign({
        userId: user.id
      }, 'thisismysecret')
    }
  },

  async loginUser(parent, args, {
    prisma
  }, info) {
    const user = await prisma.query.user({
      where: {
        email: args.data.email
      }
    }, null)

    if (!user) {
      throw new Error('User not found.')
    }

    const isMatch = await bcrypt.compare(args.data.password, user.password)

    if (!isMatch) {
      throw new Error('Unable to login')
    }

    return {
      user,
      token: jwt.sign({
        userId: user.id
      }, 'thisismysecret')
    }
  },

  deleteUser(parent, args, {
    db
  }, info) {
    const userIndex = db.users.findIndex(user => user.id === args.id);

    if (userIndex === -1) {
      throw new Error('Use not found');
    }

    const deletedUsers = db.users.splice(userIndex, 1);

    db.posts = db.posts.filter(post => {
      const match = post.author === args.id;
      if (match) {
        comments = db.comments.filter(comment => comment.post !== post.id);
      }
      return !match;
    });

    db.comments = db.omments.filter(comment => comment.author !== args.id);

    return deletedUsers[0];
  },
  updateUser(parent, args, {
    db
  }, info) {
    const {
      id,
      data
    } = args
    const user = db.users.find(user => user.id === id)

    if (!user) throw new Error('User not found')

    if (typeof data.email === 'string') {
      const emailTaken = db.users.some(user => user.email === data.email)

      if (emailTaken) throw new Error('Email taken')

      user.email = data.email
    }

    if (typeof data.name === 'string') {
      user.name = data.name
    }

    if (typeof data.age !== 'undefined') {
      user.age = data.age
    }

    return user

  },
  createPost(parent, args, {
    db,
    pubsub
  }, info) {
    const userExists = db.users.some(user => user.id === args.data.author);

    if (!userExists) throw new Error('User not found');

    const post = {
      id: uuidv4(),
      ...args.data
    };

    db.posts.push(post);

    if (args.data.published) {
      pubsub.publish('post', {
        post: { // this 'post' key have to match with schema's subscription key
          // now send the data structure like 'PostSubscriptionPayload' expect
          mutation: 'CREATED', // just stylistic choice to make it uppercase
          data: post
        }
      })
    }

    return post;
  },
  deletePost(parent, args, {
    db,
    pubsub
  }, info) {
    const postExists = db.posts.findIndex((post) => post.id === args.id)

    if (postExists === -1) {
      throw new Error('Post not found')
    }

    const [post] = db.posts.splice(postExists, 1)

    db.comments = db.comments.filter((comment) => comment.post !== args.id)

    if (post.published) {
      pubsub.publish('post', {
        post: {
          mutation: 'DELETED',
          data: post
        }
      })
    }

    return post

  },
  updatePost(parent, args, {
    db
  }, info) {
    const {
      id,
      data
    } = args
    const post = db.posts.find((post) => post.id === id)
    const originalPost = {
      ...post
    }

    if (!post) throw new Error('Post not found')

    if (typeof data.title === 'string') {
      post.title = data.title
    }

    if (typeof data.body === 'string') {
      post.body = data.body
    }

    if (typeof data.published === 'boolean') {
      post.published = data.published

      if (originalPost.published && !post.published) {
        // deleted
        pubsub.publish('post', {
          post: {
            mutation: 'DELETED',
            data: originalPost
          }
        })
      } else if (!originalPost.published && post.published) {
        // created
        pubsub.publish('post', {
          post: {
            mutation: 'CREATED',
            data: post
          }
        })
      }
    } else if (post.published) {
      // update
      pubsub.publish('post', {
        post: {
          mutation: 'UPDATED',
          data: post
        }
      })
    }

    return post
  },
  createComment(parent, args, {
    db,
    pubsub
  }, info) {
    const userExists = db.users.some(user => user.id === args.data.author);
    if (!userExists) throw new Error('User not found');
    const postExists = db.posts.find(post => post.id === args.data.post);
    if (!postExists) throw new Error('Post not found');
    if (!postExists.published) throw new Error('Post is not published yet');
    const comment = {
      id: uuidv4(),
      ...args.data
    };
    db.comments.push(comment);
    pubsub.publish(`comment ${args.data.post}`, {
      comment: {
        mutation: 'CREATED',
        data: comment
      }
    })
    return comment;
  },
  deleteComment(parent, args, {
    db,
    pubsub
  }, info) {
    const commentExists = db.comments.findIndex((comment) => comment.id === args.id)

    if (commentExists === -1) throw new Error('Comment not found')

    const [comment] = db.comments.splice(commentExists, 1)

    pubsub.publish(`comment ${comment.post}`, {
      comment: {
        mutation: 'DELETED',
        data: comment
      }
    })

    return comment;
  },
  updateComment(parent, args, {
    db,
    pubsub
  }, info) {
    let {
      id,
      data
    } = args
    const comment = db.comments.find((comment) => comment.id === id)

    if (!comment) throw new Error('Comment not found')

    if (typeof data.text === 'string') {
      comment.text = data.text
    }

    pubsub.publish(`comment ${comment.post}`, {
      comment: {
        mutation: 'UPDATED',
        data: comment
      }
    })

    return comment
  }
}

export {
  Mutation as
  default
}